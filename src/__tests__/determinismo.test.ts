import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameTurns } from '@/composables/useGameTurns'
import { useGames } from '@/composables/useGames'
import { gamesRepository } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import { recalculate } from '@/domain/stats/recalculate'
import { rankingsRepository } from '@/data/rankings.repository'
import type { ReplayPlayer } from '@/domain/replay'
import { replayTurns } from '@/domain/replay'
import { type Seat } from '@/domain/types'
import type { GameId, PlayerId, SeasonId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { HANCHAN_CON_TODO, conIdsDe } from '@/__tests__/fixtures/partidas'
import { withColada } from '@/test-utils/colada'
import type { CreateTurnInput } from '@/data/turns.repository'
import { turnsRepository } from '@/data/turns.repository'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

/**
 * T44 · RNF-1 y RNF-3 **por comportamiento**.
 *
 * Lo que ya hacía la suite era comprobar que la re-derivación es consistente consigo misma. Esto
 * comprueba lo que la spec pide de verdad: que **el resultado no depende de quién escribió el turno,
 * ni del orden en que se corrigieron, ni del recorrido que lo escribió**. Un recorrido determinista
 * puede cumplir las tres cosas y aun así colarse por un campo de sesión o por el orden de las claves.
 */

const SEATS: readonly Seat[] = ['east', 'south', 'west', 'north']

function atDay(day: number): { seconds: number; nanoseconds: number } {
  return { seconds: day * 86400, nanoseconds: 0 }
}

async function seededTable(): Promise<readonly ReplayPlayer[]> {
  const table: ReplayPlayer[] = []

  for (const [index, name] of ['Ana', 'Bob', 'Carla', 'David'].entries()) {
    const created = await playersRepository.create({ externalId: `externo-${index + 1}`, name })

    table.push({ playerId: created.id, seat: SEATS[index] as Seat, score: 25000 })
  }

  return table
}

async function seedSeason(): Promise<SeasonId> {
  const season = await seasonsCreate()

  return season
}

async function seasonsCreate(): Promise<SeasonId> {
  const { seasonsRepository } = await import('@/data/seasons.repository')
  const season = await seasonsRepository.create({
    title: 'Temporada de determinismo',
    dateFrom: atDay(0),
    dateTo: atDay(400),
  })

  return season.id
}

async function openGame(
  seasonId: SeasonId,
  table: readonly ReplayPlayer[],
  date: number,
): Promise<GameId> {
  const game = await gamesRepository.create({
    seasonId,
    date: atDay(date),
    gameLength: 'hanchan',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: 25000,
    players: table.map((player) => ({ playerId: player.playerId, seat: player.seat })),
  })

  return game.id
}

function documentsOf(
  partida: ReturnType<typeof conIdsDe>,
  mesa: readonly ReplayPlayer[],
  capturedBy: string,
): readonly CreateTurnInput[] {
  const result = replayTurns(mesa, partida, 1)

  if (!result.ok) {
    throw new Error(`no se puede recorrer desde el turno ${result.turnNo}: ${result.reason}`)
  }

  return result.outcome.turns.map((replayed, index) => {
    const captured = partida[index]

    if (captured === undefined) {
      throw new Error(`el recorrido devolvió el turno ${replayed.turnNo} sin captura`)
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

type Marcador = readonly (readonly [PlayerId, number, string, number])[]

async function finalizar(seasonId: SeasonId, gameId: GameId): Promise<Marcador> {
  const { result, unmount } = withColada(() => useGames(seasonId))

  try {
    await vi.waitFor(() => expect(result.state.value.status).toBe('success'))

    const game = await result.finalizeGame.mutateAsync({ gameId, by: 'user-finalizador' })

    return game.results
      .map((entry) => [entry.playerId, entry.finalScore, entry.finalPosition, entry.uma] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
  } finally {
    unmount()
  }
}

/** Invierte el orden de las claves de cada turno, para simular dos dispositivos distintos. */
function conClavesRevueltas(documents: readonly CreateTurnInput[]): CreateTurnInput[] {
  return documents.map((document) => {
    const revuelto: Record<string, unknown> = {}

    for (const clave of Object.keys(document).toReversed()) {
      revuelto[clave] = (document as unknown as Record<string, unknown>)[clave]
    }

    return revuelto as unknown as CreateTurnInput
  })
}

describe('T44 · RNF-1 y RNF-3 por comportamiento', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('cambiar quién captura cada turno no cambia el resultado', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)

    const primeraId = await openGame(seasonId, mesa, 10)
    const segundaId = await openGame(seasonId, mesa, 11)

    await capture(primeraId, documentsOf(partida, mesa, 'user-ana'))
    await capture(
      segundaId,
      documentsOf(partida, mesa, 'user-dispositivo-b').map((document, index) => ({
        ...document,
        // Cada turno capturado por alguien distinto: el registro `capturedBy` va en el documento y
        // es el único rastro de quién lo escribió.
        capturedBy: `user-${index + 1}`,
      })),
    )

    const primera = await finalizar(seasonId, primeraId)
    const segunda = await finalizar(seasonId, segundaId)

    expect(segunda).toStrictEqual(primera)
  })

  it('el orden de las claves del turno no cambia el resultado', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)

    const normalId = await openGame(seasonId, mesa, 10)
    const revueltoId = await openGame(seasonId, mesa, 11)

    await capture(normalId, documentsOf(partida, mesa, 'user-ana'))
    await capture(revueltoId, conClavesRevueltas(documentsOf(partida, mesa, 'user-ana')))

    const normal = await finalizar(seasonId, normalId)
    const revuelto = await finalizar(seasonId, revueltoId)

    expect(revuelto).toStrictEqual(normal)
  })

  it('corregir en orden ascendente y en descendente da el mismo resultado', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)
    const documentos = documentsOf(partida, mesa, 'user-ana')

    const ascendenteId = await openGame(seasonId, mesa, 10)
    const descendenteId = await openGame(seasonId, mesa, 11)

    await capture(ascendenteId, documentos)
    await capture(descendenteId, documentos)

    // El turno 7 pasa de ser un empate a ser el tsumo de la localía: cambia el contador y el bote.
    const turnoSiete = documentos[6]

    if (turnoSiete === undefined) {
      throw new Error('la partida no tiene séptimo turno')
    }

    await corregirEnOrden(ascendenteId, documentos, [7, 9])
    await corregirEnOrden(descendenteId, documentos, [9, 7])

    const ascendente = await finalizar(seasonId, ascendenteId)
    const descendente = await finalizar(seasonId, descendenteId)

    expect(turnoSiete.resultType).toBe('tsumo')
    expect(descendente).toStrictEqual(ascendente)
  })

  it('corregir el ganador de un turno es posible, y el resultado converge al de la partida buena', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)
    const buenos = documentsOf(partida, mesa, 'user-ana')

    /**
     * El turno 5 se captura con un solo ganador cuando son dos. Si `capturedTurnOf` leyera los
     * ganadores del documento guardado en vez de los del parche, la corrección se re-derivaría con
     * el ganador viejo y no convergería nunca: la partida corregida y la buena no podrían coincidir.
     */
    const malos = buenos.map((document, index) =>
      index === 4 ? { ...document, value: document.value.slice(0, 1) } : document,
    )

    const buenaId = await openGame(seasonId, mesa, 10)
    const corregidaId = await openGame(seasonId, mesa, 11)

    await capture(buenaId, buenos)
    await capture(corregidaId, malos)

    const quintoBueno = buenos[4]

    if (quintoBueno === undefined) {
      throw new Error('la partida no tiene quinto turno')
    }

    const { result, unmount } = withColada(() => useGameTurns(corregidaId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(buenos.length))

      await result.correctTurn.mutateAsync({
        turnNo: 5,
        patch: { value: quintoBueno.value },
        by: 'user-que-corrige',
        expectedTurnCount: buenos.length,
        expectedAuditCount: 0,
      })

      unmount()
    } catch (caught: unknown) {
      unmount()
      throw caught
    }

    const buena = await finalizar(seasonId, buenaId)
    const corregida = await finalizar(seasonId, corregidaId)

    expect(corregida).toStrictEqual(buena)
  })

  it('aplicar de nuevo las reglas a una partida corregida reproduce el ranking', async () => {
    const mesa = await seededTable()
    const seasonId = await seedSeason()
    const partida = conIdsDe(HANCHAN_CON_TODO, mesa)
    const documentos = documentsOf(partida, mesa, 'user-ana')

    const gameId = await openGame(seasonId, mesa, 10)

    await capture(gameId, documentos)

    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(documentos.length))

      await result.correctTurn.mutateAsync({
        turnNo: 3,
        patch: {
          tenpai: [mesa[0]?.playerId, mesa[1]?.playerId].filter(
            (id): id is PlayerId => id !== undefined,
          ),
        },
        by: 'user-que-corrige',
        expectedTurnCount: documentos.length,
        expectedAuditCount: 0,
      })

      unmount()
    } catch (caught: unknown) {
      unmount()
      throw caught
    }

    await finalizar(seasonId, gameId)

    const juego = await gamesRepository.getById(gameId)

    if (juego === null) {
      throw new Error('la partida finalizada no se puede leer')
    }

    /**
     * RNF-3: aplicar de nuevo las reglas a lo que quedó guardado tiene que reproducir el ranking.
     * Se compara contra el documento que dejó la finalización —`rankings/{seasonId}`— en vez de
     * contra números escritos a mano, que es donde un test de RNF-3 suele mentir sin querer.
     */
    const escrito = await rankingsRepository.listBySeason(seasonId)
    const { rankings } = recalculate(seasonId, [
      {
        gameId,
        seasonId,
        status: 'finalized',
        results: juego.results.map((entry) => ({
          playerId: entry.playerId,
          playerName: entry.playerName,
          seat: entry.seat,
          // `PlayerFinalResult` guarda `score` sin uma y `finalScore` con ella; los agregados suman
          // el segundo, así que los dos tienen que estar.
          score: entry.finalScore - entry.uma,
          finalScore: entry.finalScore,
          chombo: entry.chombo,
          bankrupt: entry.bankrupt,
          position: entry.finalPosition,
          uma: entry.uma,
        })),
        hands: [],
      },
    ])

    const porJugador = (
      entries: readonly { readonly playerId: PlayerId; readonly points: number }[],
    ) =>
      entries
        .map((entry) => [entry.playerId, entry.points] as const)
        .sort((a, b) => a[0].localeCompare(b[0]))

    expect(porJugador(rankings)).toStrictEqual(porJugador(escrito))
    expect(porJugador(rankings)).not.toStrictEqual([])
  })
})

/** Aplica las correcciones una a una, en el orden dado, releyendo el estado entre ellas. */
async function corregirEnOrden(
  gameId: GameId,
  documentos: readonly CreateTurnInput[],
  turnos: readonly number[],
): Promise<void> {
  const { result, unmount } = withColada(() => useGameTurns(gameId))

  try {
    await vi.waitFor(() => expect(result.data.value).toHaveLength(documentos.length))

    for (const turnNo of turnos) {
      const document = documentos[turnNo - 1]

      if (document === undefined) {
        throw new Error(`no hay documento para el turno ${turnNo}`)
      }

      const stored = await turnsRepository.list(gameId)
      const actual = stored.find((turn) => turn.turnNo === turnNo)

      await result.correctTurn.mutateAsync({
        turnNo,
        patch: {
          resultType: actual?.resultType ?? document.resultType,
          tenpai: actual?.tenpai ?? document.tenpai,
        },
        by: `user-turno-${turnNo}`,
        expectedTurnCount: stored.length,
        expectedAuditCount: actual?.audit.length ?? 0,
      })
    }

    unmount()
  } catch (caught: unknown) {
    unmount()
    throw caught
  }
}
