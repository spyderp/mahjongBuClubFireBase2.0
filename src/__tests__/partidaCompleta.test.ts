import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameTurns } from '@/composables/useGameTurns'
import { useGames } from '@/composables/useGames'
import { gamesRepository } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { turnsRepository } from '@/data/turns.repository'
import type { CreateTurnInput } from '@/data/turns.repository'
import { replayTurns } from '@/domain/replay'
import type { CapturedTurn, ReplayPlayer } from '@/domain/replay'
import { type Seat } from '@/domain/types'
import type { GameId, GameLength, PlayerId, SeasonId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
import {
  HANCHAN_CON_TODO,
  MESA,
  PARTIDA_CON_CHOMBO,
  TONPUUSEN_SENCILLA,
  conIdsDe,
  renumerar,
} from '@/__tests__/fixtures/partidas'
import { withColada } from '@/test-utils/colada'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

const DAY = 86400
const SEATS: readonly Seat[] = ['east', 'south', 'west', 'north']

function atDay(day: number): { seconds: number; nanoseconds: number } {
  return { seconds: day * DAY, nanoseconds: 0 }
}

/** Los cuatro jugadores reales del club, para que `finalizeGame` pueda desnormalizar el nombre. */
async function seededTable(): Promise<readonly ReplayPlayer[]> {
  const table: ReplayPlayer[] = []

  for (const [index, name] of ['Ana', 'Bob', 'Carla', 'David'].entries()) {
    const created = await playersRepository.create({ externalId: `externo-${index + 1}`, name })

    table.push({ playerId: created.id, seat: SEATS[index] as Seat, score: 25000 })
  }

  return table
}

async function seedSeason(): Promise<SeasonId> {
  const season = await seasonsRepository.create({
    title: 'Temporada de prueba',
    dateFrom: atDay(0),
    dateTo: atDay(400),
  })

  return season.id
}

async function openGame(
  seasonId: SeasonId,
  table: readonly ReplayPlayer[],
  gameLength: GameLength = 'hanchan',
): Promise<GameId> {
  const game = await gamesRepository.create({
    seasonId,
    date: atDay(10),
    gameLength,
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: 25000,
    players: table.map((player) => ({ playerId: player.playerId, seat: player.seat })),
  })

  return game.id
}

/**
 * Los documentos que se escriben para una partida, con los valores **derivados** ya resueltos por
 * `replayTurns`. La fixture solo trae lo capturado —es lo único que escribe una persona—, así que
 * sin este paso los documentos irían con ronda, localía, contador, valores y deltas a cero, que es
 * un atajo que escondería justo lo que este test viene a comprobar.
 */
function documentsOf(
  turns: readonly CapturedTurn[],
  mesa: readonly ReplayPlayer[],
  capturedBy: string,
): readonly CreateTurnInput[] {
  const result = replayTurns(mesa, turns, 1)

  if (!result.ok) {
    throw new Error(
      `la partida no se puede recorrer desde el turno ${result.turnNo}: ${result.reason}`,
    )
  }

  return result.outcome.turns.map((replayed, index) => {
    const captured = turns[index]

    if (captured === undefined) {
      throw new Error(`el recorrido devolvió un turno ${replayed.turnNo} sin su captura`)
    }

    return {
      turnNo: replayed.turnNo,
      wind: replayed.wind,
      dealerId: replayed.dealerId,
      honba: replayed.honba,
      resultType: captured.resultType,
      yaku: [...captured.hand.yaku],
      yakuHan: captured.hand.yakuHan,
      yakuHanOverride: 0,
      doraCount: captured.hand.doraCount,
      fu: captured.hand.fu,
      tenpai: [...captured.tenpai],
      riichiDeclaredBy: [...captured.riichiDeclaredBy],
      riichiSticks: replayed.riichiSticks,
      value: replayed.values,
      deltas: replayed.deltas,
      capturedBy,
      isRenchan: index > 0 && replayed.dealerId === result.outcome.turns[index - 1]?.dealerId,
      isFinalTurn: replayed.turnNo === result.outcome.turns.length,
      discarderId: captured.discarderId,
      chomboId: captured.chomboId,
    }
  })
}

async function capture(gameId: GameId, documents: readonly CreateTurnInput[]): Promise<void> {
  for (const document of documents) {
    await turnsRepository.create(gameId, document)
  }
}

/** Finaliza la partida y devuelve los números ordenados, que es lo que tiene que ser idéntico. */
async function finishAndReadScores(
  seasonId: SeasonId,
  gameId: GameId,
): Promise<readonly (readonly [PlayerId, number, string, number, boolean])[]> {
  const { result, unmount } = withColada(() => useGames(seasonId))

  try {
    await vi.waitFor(() => expect(result.state.value.status).toBe('success'))

    const game = await result.finalizeGame.mutateAsync({ gameId, by: 'user-1' })

    expect(game.status).toBe('finalized')

    return game.results
      .map(
        (entry) =>
          [entry.playerId, entry.finalScore, entry.finalPosition, entry.uma, entry.chombo] as const,
      )
      .sort((a, b) => a[0].localeCompare(b[0]))
  } finally {
    unmount()
  }
}

describe('T41 · partida completa de extremo a extremo', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('las tres fixtures de T40 se recorren enteras sin que el motor las rechace', () => {
    const failures: string[] = []

    for (const [name, turns] of Object.entries({
      tonpuusenSencilla: TONPUUSEN_SENCILLA,
      hanchanConTodo: HANCHAN_CON_TODO,
      partidaConChombo: PARTIDA_CON_CHOMBO,
    })) {
      const result = replayTurns(MESA, turns, 1)

      if (!result.ok) {
        failures.push(`${name}: rechazó el turno ${result.turnNo} con ${result.reason}`)
        continue
      }

      if (result.outcome.turns.length !== turns.length) {
        failures.push(`${name}: devolvió ${result.outcome.turns.length} turnos de ${turns.length}`)
      }
    }

    expect(failures).toStrictEqual([])
  })

  it('hanchanConTodo llega hasta el resultado final con las cuatro fichas de riichi dentro', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()
    const gameId = await openGame(seasonId, mesa)
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)

    await capture(gameId, documentsOf(partida, mesa, 'user-1'))

    const stored = await turnsRepository.list(gameId)
    const declaradaPor = new Map<string, number>()

    for (const turn of stored) {
      for (const authorId of turn.riichiDeclaredBy) {
        declaradaPor.set(authorId, (declaradaPor.get(authorId) ?? 0) + 1)
      }
    }

    // Las cuatro declaraciones de la fixture, repartidas una por jugador.
    expect([...declaradaPor.values()].sort()).toStrictEqual([1, 1, 1, 1])

    const conMultiRon = stored.filter((turn) => turn.resultType === 'ron' && turn.value.length > 1)
    const conChombo = stored.filter((turn) => turn.resultType === 'chombo')

    expect(conMultiRon).toHaveLength(1)
    expect(conChombo).toHaveLength(1)

    const scores = await finishAndReadScores(seasonId, gameId)

    expect(scores).toHaveLength(4)

    /**
     * Dos fichas de riichi se adjudicaron en el turno 3 y la del ron múltiple en el 5; las de A y B
     * siguen en la mesa, así que la partida **no** suma 100 000. Es la comprobación de que la
     * fixture conserva las cuatro fichas y no solo dos.
     */
    const total = scores.reduce((suma, [, score]) => suma + score, 0)

    expect(total).toBe(99000)
  })

  it('tonpuusenSencilla llega a un resultado final y suma 100 000', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()
    const gameId = await openGame(seasonId, mesa, 'tonpuusen')

    await capture(gameId, documentsOf(conIdsDe(TONPUUSEN_SENCILLA, mesa), mesa, 'user-1'))

    const scores = await finishAndReadScores(seasonId, gameId)
    const total = scores.reduce((suma, [, score]) => suma + score, 0)

    expect(scores).toHaveLength(4)
    expect(total).toBe(100000)
  })

  it('una partida corregida da el mismo número que la misma partida capturada sin corregir', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()

    /**
     * La partida buena se captura tal cual. La que va a corregir se captura con **el turno 5 mal**:
     * un empate donde debía haber un ron múltiple. No es un retoque cosmético: cambiar el tipo de
     * resultado deja la ficha de riichi sin adjudicar, así que el bote se acumula hasta el turno 7
     * y **todos** los turnos siguientes dan otra cifra. Si la corrección no re-derivara, los dos
     * números no podrían coincidir.
     */
    const buenaId = await openGame(seasonId, mesa)
    const corregidaId = await openGame(seasonId, mesa)
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)

    await capture(buenaId, documentsOf(partida, mesa, 'user-1'))

    const quintoMal: CapturedTurn = {
      turnNo: 5,
      resultType: 'ryuukyoku',
      hand: { yaku: ['tanyao'], yakuHan: 1, doraCount: 0, fu: 30 },
      winners: [],
      discarderId: null,
      chomboId: null,
      tenpai: [mesa[0]?.playerId, mesa[1]?.playerId].filter(
        (id): id is PlayerId => id !== undefined,
      ),
      riichiDeclaredBy: [],
    }

    const capturadaMal = partida.map((turn) => (turn.turnNo === 5 ? quintoMal : turn))

    await capture(corregidaId, documentsOf(capturadaMal, mesa, 'user-1'))

    /**
     * El turno mal no es cosmético: al ser un empate en vez de un ron, la ficha de riichi se queda en
     * la mesa, el bote se acumula y **los cuatro marcadores** salen distintos. Se comprueba antes de
     * corregir, porque después ya no hay diferencia que medir.
     */
    const antes = replayTurns(mesa, capturadaMal, 1)
    const despuesDe = replayTurns(mesa, partida, 1)

    expect(antes.ok && despuesDe.ok).toBe(true)
    expect(antes.ok && despuesDe.ok && antes.outcome.scores).not.toStrictEqual(
      despuesDe.ok ? despuesDe.outcome.scores : [],
    )

    const { result, unmount } = withColada(() => useGameTurns(corregidaId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(HANCHAN_CON_TODO.length))

      const quintoBueno = documentsOf(partida, mesa, 'user-1')[4]

      if (quintoBueno === undefined) {
        throw new Error('la partida buena no tiene quinto turno')
      }

      await result.correctTurn.mutateAsync({
        turnNo: 5,
        patch: {
          resultType: quintoBueno.resultType,
          yaku: quintoBueno.yaku,
          yakuHan: quintoBueno.yakuHan,
          doraCount: quintoBueno.doraCount,
          fu: quintoBueno.fu,
          discarderId: quintoBueno.discarderId,
          value: quintoBueno.value,
          deltas: quintoBueno.deltas,
        },
        by: 'user-2',
        expectedTurnCount: HANCHAN_CON_TODO.length,
        expectedAuditCount: 0,
      })

      unmount()
    } catch (caught: unknown) {
      unmount()
      throw caught
    }

    const buena = await finishAndReadScores(seasonId, buenaId)
    const corregida = await finishAndReadScores(seasonId, corregidaId)

    expect(corregida).toStrictEqual(buena)
  })

  it('borrar un turno deja la partida en el estado de una en la que nunca se capturó', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()

    /**
     * `enteraId` es una partida en la que el turno 5 **nunca existió**; `borradaId` es la partida
     * entera a la que se le borra. Las dos deben acabar con exactamente los mismos turnos, porque
     * RF-18.9 dice que el estado que queda es el de una partida en la que ese turno no se capturó.
     */
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)
    const sinQuinto = renumerar(partida, 5)
    const enteraId = await openGame(seasonId, mesa)
    const borradaId = await openGame(seasonId, mesa)

    await capture(enteraId, documentsOf(sinQuinto, mesa, 'user-1'))
    await capture(borradaId, documentsOf(partida, mesa, 'user-1'))

    const { result, unmount } = withColada(() => useGameTurns(borradaId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(partida.length))

      await result.deleteTurn.mutateAsync({
        turnNo: 5,
        by: 'user-2',
        expectedTurnCount: partida.length,
      })

      unmount()
    } catch (caught: unknown) {
      unmount()
      throw caught
    }

    const entera = await turnsRepository.list(enteraId)
    const borrada = await turnsRepository.list(borradaId)

    expect(borrada).toHaveLength(entera.length)
    expect(borrada.map((turn) => turn.turnNo)).toStrictEqual(entera.map((turn) => turn.turnNo))
    expect(borrada.map((turn) => turn.wind)).toStrictEqual(entera.map((turn) => turn.wind))
    expect(borrada.map((turn) => turn.dealerId)).toStrictEqual(entera.map((turn) => turn.dealerId))
    expect(borrada.map((turn) => turn.honba)).toStrictEqual(entera.map((turn) => turn.honba))
    expect(borrada.map((turn) => turn.riichiSticks)).toStrictEqual(
      entera.map((turn) => turn.riichiSticks),
    )
    expect(borrada.map((turn) => turn.deltas)).toStrictEqual(entera.map((turn) => turn.deltas))
    expect(borrada.map((turn) => turn.value)).toStrictEqual(entera.map((turn) => turn.value))
  })
})
