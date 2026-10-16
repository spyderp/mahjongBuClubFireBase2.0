import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { createBatch } from '@/data/batch'
import { DataError } from '@/data/errors'
import { gamesRepository } from '@/data/games.repository'
import type { CreateGameInput, GameResultDoc, GameRecord } from '@/data/games.repository'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { rankingsRepository } from '@/data/rankings.repository'
import type { RankingEntry } from '@/data/rankings.repository'
import { turnsRepository } from '@/data/turns.repository'
import type { TurnRecord, UpdateTurnPatch } from '@/data/turns.repository'
import { capturedTurnOf } from '@/data/turns.repository'
import { finalizeResults, offersAbandon, playerScore, transition } from '@/domain/game'
import type { FinalizablePlayer, PlayerFinalResult } from '@/domain/game'
import { replayTurns } from '@/domain/replay'
import type { CapturedTurn, ReplayResult } from '@/domain/replay'
import { recalculate } from '@/domain/stats/recalculate'
import type { RankedGameResult, StatsGame, WinningHand } from '@/domain/stats'
import type { GameId, GameStatus, PlayerId, SeasonId, Timestamp } from '@/domain/types'
import { gameDetailQuery, gamesBySeasonQuery, gamesKeys, gamesListOpenQuery } from '@/queries/games'

export type FinalizeVars = {
  readonly gameId: GameId
  readonly by: string
}

/**
 * T67 · RF-2.1 a RF-2.9 y RF-9.1 a RF-9.6: consulta y mutaciones de partidas.
 *
 * Finalizar resuelve el resultado desde los turnos guardados con las funciones puras de
 * `domain/game` (RF-8.x), y deshacerlo solo exige recalcular desde `games[]` (RF-9.5). Ambas
 * persisten juego + derivados en un único `WriteBatch` y, al terminar, invalidan
 * `['games']` junto con `['season-stats', seasonId]` y `['rankings', seasonId]` (T67).
 */
export function useGames(seasonId?: MaybeRefOrGetter<SeasonId | null>) {
  const season = computed(() => (seasonId === undefined ? null : toValue(seasonId)))
  const bySeason = useQuery(() => gamesBySeasonQuery(season.value))
  const openGames = useQuery(gamesListOpenQuery())
  const queryCache = useQueryCache()

  const createGame = useMutation({
    mutation: (input: CreateGameInput): Promise<GameRecord> => gamesRepository.create(input),
    onSettled: () => {
      void queryCache.invalidateQueries({ key: gamesKeys.root })
    },
  })

  const finalizeGame = useMutation({
    mutation: async ({ gameId, by }: FinalizeVars): Promise<GameRecord> => {
      const game = await gamesRepository.getById(gameId)
      if (game === null) {
        throw new DataError('notFound')
      }

      const turns = await turnsRepository.list(gameId)
      const decided = transition('finalize', {
        status: game.status,
        mustFinalize: game.mustFinalize,
        turnCount: turns.length,
        gameLength: game.gameLength,
        idleDays: 0,
      })
      if (!decided.ok) {
        throw new DataError('notOpen')
      }

      const names = await resolvePlayerNames(queryCache)
      /**
       * RF-18.12 y RNF-3: el resultado final sale de los turnos **re-derivados**, no de los que
       * quedaron escritos. Para una partida corregida da igual —`correctTurn` ya los escribió
       * re-derivados— y para una captura anterior a `specs/002` es la diferencia entre el número que
       * se capturó y el que la partida realmente vale.
       *
       * Solo se recorre si la partida se va a **finalizar**: una que se aborta por debajo del
       * mínimo no calcula resultados y no tiene por qué ser reproducible.
       */
      const finalsSource = decided.status === 'finalized' ? derivedTurnsOf(game, turns) : turns
      const results =
        decided.status === 'finalized' ? toGameResultDocs(finalsOf(game, finalsSource), names) : []
      const batch = createBatch()

      await gamesRepository.update(
        gameId,
        {
          status: decided.status,
          results,
          finalizationAudit: [
            ...game.finalizationAudit,
            { at: nowTimestamp(), by, action: 'finalize' },
          ],
        },
        batch,
      )

      if (decided.status === 'finalized' && game.seasonId !== null) {
        await rewriteSeasonDocs(game.seasonId, gameId, 'finalized', results, finalsSource, batch)
      }

      await batch.commit()

      return requireGame(gameId)
    },
    onSettled: (saved) => {
      void queryCache.invalidateQueries({ key: gamesKeys.root })
      invalidateSeasonDerived(queryCache, saved?.seasonId ?? null)
    },
  })

  const unfinalizeGame = useMutation({
    mutation: async ({ gameId, by }: FinalizeVars): Promise<GameRecord> => {
      const game = await gamesRepository.getById(gameId)
      if (game === null) {
        throw new DataError('notFound')
      }
      if (game.status !== 'finalized') {
        throw new DataError('notOpen')
      }

      const batch = createBatch()

      await gamesRepository.update(
        gameId,
        {
          status: 'open',
          results: [],
          finalizationAudit: [
            ...game.finalizationAudit,
            { at: nowTimestamp(), by, action: 'unfinalize' },
          ],
        },
        batch,
      )

      if (game.seasonId !== null) {
        await rewriteSeasonDocs(game.seasonId, gameId, 'open', [], [], batch)
      }

      await batch.commit()

      return requireGame(gameId)
    },
    onSettled: (saved) => {
      void queryCache.invalidateQueries({ key: gamesKeys.root })
      invalidateSeasonDerived(queryCache, saved?.seasonId ?? null)
    },
  })

  const abandonGame = useMutation({
    mutation: async (gameId: GameId): Promise<GameRecord> => {
      const game = await gamesRepository.getById(gameId)
      if (game === null) {
        throw new DataError('notFound')
      }

      const decided = transition('abandon', {
        status: game.status,
        mustFinalize: game.mustFinalize,
        turnCount: 0,
        gameLength: game.gameLength,
        idleDays: offersAbandon(game.updatedAt, nowTimestamp()) ? STALE_DAYS + 1 : 0,
      })
      if (!decided.ok) {
        throw new DataError('notOpen')
      }

      const batch = createBatch()
      await gamesRepository.update(gameId, { status: decided.status }, batch)
      await batch.commit()

      return requireGame(gameId)
    },
    onSettled: () => {
      void queryCache.invalidateQueries({ key: gamesKeys.root })
    },
  })

  return {
    state: bySeason.state,
    data: bySeason.data,
    isLoading: bySeason.isLoading,
    error: bySeason.error,
    refresh: bySeason.refresh,
    refetch: bySeason.refetch,
    openGames: {
      state: openGames.state,
      data: openGames.data,
      isLoading: openGames.isLoading,
      error: openGames.error,
      refresh: openGames.refresh,
      refetch: openGames.refetch,
    },
    createGame,
    finalizeGame,
    unfinalizeGame,
    abandonGame,
  }
}

/** Detalle de una partida para la pantalla de juego (invalida `['games', 'detail', gameId]`). */
export function useGameDetail(gameId: MaybeRefOrGetter<GameId>) {
  const game = computed(() => toValue(gameId))
  const query = useQuery(() => gameDetailQuery(game.value))

  return {
    state: query.state,
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
    refetch: query.refetch,
  }
}

const STALE_DAYS = 7

export function nowTimestamp(): Timestamp {
  const milliseconds = Date.now()

  return {
    seconds: Math.floor(milliseconds / 1000),
    nanoseconds: (milliseconds % 1000) * 1_000_000,
  }
}

/**
 * La partida recorrida con `domain/replay.ts`, o el rechazo que la deja sin reproducir.
 *
 * `patch` se aplica solo al turno que se está corrigiendo: es la partida ya corregida la que se
 * deriva, no la guardada.
 *
 * **Decisión del club del 2026-10-15: una partida que el recorrido rechaza no se puede finalizar.**
 * Finalizarla con los deltas que quedaron escritos produciría un resultado que la partida no
 * respalda —y que nadie podría comprobar contra RNF-3—, así que aquí no hay vuelta atrás: se rechaza
 * y se dice qué turno lo impide y por qué (RF-18.16).
 */
export function replayOutcomeOf(
  game: GameRecord,
  turns: readonly TurnRecord[],
  desdeTurno: number,
  patch?: UpdateTurnPatch,
): ReplayOutcome {
  const captured: readonly CapturedTurn[] = turns.map((turn) =>
    turn.turnNo === desdeTurno && patch !== undefined
      ? capturedTurnOf(turn, patch)
      : capturedTurnOf(turn),
  )
  const result: ReplayResult = replayTurns(
    game.players.map((player) => ({
      playerId: player.playerId,
      seat: player.seat,
      score: game.startPoints,
    })),
    captured,
    desdeTurno,
  )

  if (!result.ok) {
    throw new DataError(
      'replayInvalid',
      `El turno ${result.turnNo} no se puede recalcular: ${result.reason}`,
      { turn: String(result.turnNo) },
    )
  }

  return result.outcome
}

export type ReplayOutcome = Extract<ReplayResult, { readonly ok: true }>['outcome']

/**
 * Los turnos de la partida con los valores re-derivados por `domain/replay.ts`. Reutiliza
 * `replayOutcomeOf`, así que **rechaza** igual que Corrige y `deleteTurn`: no hay resultado final
 * posible sobre una partida que no se puede reproducir.
 */
function derivedTurnsOf(game: GameRecord, turns: readonly TurnRecord[]): readonly TurnRecord[] {
  const result = replayOutcomeOf(game, turns, 1)
  const overrides = new Map(result.turns.map((turn) => [turn.turnNo, turn]))

  return turns.map((turn) => {
    const derived = overrides.get(turn.turnNo)

    return derived === undefined
      ? turn
      : {
          ...turn,
          wind: derived.wind,
          dealerId: derived.dealerId,
          honba: derived.honba,
          riichiSticks: derived.riichiSticks,
          value: derived.values,
          deltas: derived.deltas,
        }
  })
}

function invalidateSeasonDerived(
  queryCache: ReturnType<typeof useQueryCache>,
  seasonId: SeasonId | null,
): void {
  if (seasonId === null) {
    return
  }

  void queryCache.invalidateQueries({ key: ['season-stats', seasonId] })
  void queryCache.invalidateQueries({ key: ['rankings', seasonId] })
}

/** RF-8.1 y RF-8.8: posición y marcador final desde los turnos guardados (funciones puras). */
function finalsOf(game: GameRecord, turns: readonly TurnRecord[]): readonly PlayerFinalResult[] {
  const turnDeltas = turns.map((turn) => turn.deltas)
  const standings: readonly FinalizablePlayer[] = game.players.map((participant) => {
    const score = playerScore(participant.playerId, game.startPoints, turnDeltas)

    return {
      playerId: participant.playerId,
      seat: participant.seat,
      score,
      chombo: turns.some(
        (turn) => turn.resultType === 'chombo' && turn.chomboId === participant.playerId,
      ),
      bankrupt: score < 0,
    }
  })

  return finalizeResults(standings)
}

function toGameResultDocs(
  finals: readonly PlayerFinalResult[],
  names: ReadonlyMap<PlayerId, string>,
): readonly GameResultDoc[] {
  return finals.map((result) => ({
    playerId: result.playerId,
    playerName: names.get(result.playerId) ?? '',
    seat: result.seat,
    finalScore: result.finalScore,
    finalPosition: result.position,
    uma: result.uma,
    chombo: result.chombo,
    bankrupt: result.bankrupt,
  }))
}

function toRankedResult(doc: GameResultDoc): RankedGameResult {
  return {
    playerId: doc.playerId,
    playerName: doc.playerName,
    seat: doc.seat,
    score: doc.finalScore - doc.uma,
    chombo: doc.chombo,
    bankrupt: doc.bankrupt,
    position: doc.finalPosition,
    uma: doc.uma,
    finalScore: doc.finalScore,
  }
}

function toStatsGame(
  game: GameRecord,
  status: GameStatus,
  results: readonly GameResultDoc[],
  turns: readonly TurnRecord[],
): StatsGame {
  return {
    gameId: game.id,
    seasonId: game.seasonId,
    status,
    results: results.map(toRankedResult),
    hands: winningHands(turns),
  }
}

/** RF-12.4: manos ganadoras de una partida desde los turnos ya guardados. */
function winningHands(turns: readonly TurnRecord[]): readonly WinningHand[] {
  const hands: WinningHand[] = []

  for (const turn of turns) {
    if (turn.resultType !== 'tsumo' && turn.resultType !== 'ron') {
      continue
    }

    for (const value of turn.value) {
      hands.push({
        playerId: value.playerId,
        resultType: turn.resultType,
        yaku: turn.yaku,
        doraCount: turn.doraCount,
        han: value.han,
      })
    }
  }

  return hands
}

/**
 * RF-9.5 y RF-9.6: recalcula `playerSeasonStats` y `rankings` de la temporada desde `games[]`
 * (idempotente) y los encola en el `WriteBatch` compartido, sin confirmar. Todas las lecturas
 * ocurren antes de encolar, así el batch nunca se envenena con una escritura sin confirmar.
 */
export async function rewriteSeasonDocs(
  seasonId: SeasonId,
  changedGameId: GameId,
  changedStatus: GameStatus,
  changedResults: readonly GameResultDoc[],
  changedTurns: readonly TurnRecord[],
  batch: ReturnType<typeof createBatch>,
): Promise<void> {
  const seasonGames = await gamesRepository.listBySeason(seasonId)
  const statsGames: StatsGame[] = []

  for (const game of seasonGames) {
    if (game.id === changedGameId) {
      statsGames.push(toStatsGame(game, changedStatus, changedResults, changedTurns))
      continue
    }

    const gameTurns = await turnsRepository.list(game.id)
    statsGames.push(toStatsGame(game, game.status, game.results, gameTurns))
  }

  const { stats, rankings } = recalculate(seasonId, statsGames)
  const gamesPlayed = new Map(stats.map((player) => [player.playerId, player.gamesPlayed] as const))
  const entries: readonly RankingEntry[] = rankings.map((ranked) => ({
    ...ranked,
    gamesPlayed: gamesPlayed.get(ranked.playerId) ?? 0,
  }))

  await playerSeasonStatsRepository.replaceForSeason(seasonId, stats, batch)
  await rankingsRepository.replaceForSeason(seasonId, entries, batch)
}

/** Nombres desde la caché compartida de `['players']`; si aún no está, se leen una vez. */
async function resolvePlayerNames(
  queryCache: ReturnType<typeof useQueryCache>,
): Promise<Map<PlayerId, string>> {
  const cached = queryCache.getQueryData<PlayerRecord[]>(['players'])
  const players = cached ?? (await playersRepository.list())

  return new Map(players.map((player) => [player.id, player.name] as const))
}

async function requireGame(gameId: GameId): Promise<GameRecord> {
  const saved = await gamesRepository.getById(gameId)

  if (saved === null) {
    throw new DataError('notFound')
  }

  return saved
}
