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
import type { TurnRecord } from '@/data/turns.repository'
import { finalizeResults, offersAbandon, playerScore, transition } from '@/domain/game'
import type { FinalizablePlayer, PlayerFinalResult } from '@/domain/game'
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
      const results =
        decided.status === 'finalized' ? toGameResultDocs(finalsOf(game, turns), names) : []
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
        await rewriteSeasonDocs(game.seasonId, gameId, 'finalized', results, turns, batch)
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

function nowTimestamp(): Timestamp {
  const milliseconds = Date.now()

  return {
    seconds: Math.floor(milliseconds / 1000),
    nanoseconds: (milliseconds % 1000) * 1_000_000,
  }
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
        (turn) =>
          turn.resultType === 'chombo' &&
          turn.deltas.some((d) => d.playerId === participant.playerId),
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
