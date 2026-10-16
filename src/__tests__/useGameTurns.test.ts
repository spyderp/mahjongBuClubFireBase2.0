import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@pinia/colada'
import {
  clearTurnDraft,
  loadTurnDraft,
  saveTurnDraft,
  useGameTurns,
} from '@/composables/useGameTurns'
import { DataError } from '@/data/errors'
import { gamesRepository } from '@/data/games.repository'
import type { GameResultDoc } from '@/data/games.repository'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import { rankingsRepository } from '@/data/rankings.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { turnsRepository } from '@/data/turns.repository'
import type { CreateTurnInput } from '@/data/turns.repository'
import { recalculate } from '@/domain/stats/recalculate'
import type { PlayerDelta } from '@/domain/turn'
import { toGameId, toPlayerId } from '@/domain/types'
import type { GameId, PlayerId } from '@/domain/types'
import { doc, fakeGetDb, fakeReset, writeBatch } from '@/test-utils/fakeFirestore'
import { withColada } from '@/test-utils/colada'

/**
 * RF-18.14: una corrección y un borrado escriben en **un único** `WriteBatch`. Contar los lotes que
 * se crean es la forma más directa de comprobarlo: si `deleteTurn` abriera el suyo para los turnos
 * renumerados y el de `correctTurn` para los re-derivados, aquí habría dos.
 */
const { createdBatches } = vi.hoisted(() => ({ createdBatches: [] as unknown[] }))

vi.mock('firebase/firestore', async () => {
  const fake = await import('@/test-utils/fakeFirestore')
  const create = fake.writeBatch

  return {
    ...fake,
    writeBatch: (...args: Parameters<typeof create>) => {
      const batch = create(...args)

      createdBatches.push(batch)

      return batch
    },
  }
})
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

const DAY = 86400

function atDay(day: number): { seconds: number; nanoseconds: number } {
  return { seconds: day * DAY, nanoseconds: 0 }
}

const PLAYERS = [
  { playerId: toPlayerId('p1'), seat: 'east' as const },
  { playerId: toPlayerId('p2'), seat: 'south' as const },
  { playerId: toPlayerId('p3'), seat: 'west' as const },
  { playerId: toPlayerId('p4'), seat: 'north' as const },
]

const P1 = toPlayerId('p1')
const P2 = toPlayerId('p2')
const P3 = toPlayerId('p3')
const P4 = toPlayerId('p4')

async function openGame(): Promise<{ readonly id: GameId }> {
  return gamesRepository.create({
    seasonId: null,
    date: atDay(1),
    gameLength: 'tonpuusen',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: 25000,
    players: PLAYERS,
  })
}

function chomboTurn(turnNo: number, deltas: readonly PlayerDelta[]) {
  return {
    turnNo,
    wind: 'east' as const,
    dealerId: toPlayerId('p1'),
    honba: 0,
    resultType: 'chombo' as const,
    yaku: [],
    yakuHan: 0,
    doraCount: 0,
    fu: 0,
    tenpai: [],
    riichiDeclaredBy: [],
    riichiSticks: 0,
    value: [],
    deltas,
    capturedBy: 'user-1',
    isRenchan: false,
    isFinalTurn: false,
    discarderId: null,
    chomboId: toPlayerId('p1'),
    yakuHanOverride: 0,
  }
}

/**
 * Un empate con los deltas que le tocarían al motor. Se guardan **todos** con la misma localía y el
 * mismo honba porque el dealer conserva la tenpai en el primero; corregirlo para que la pierda es
 * lo que hace que la re-derivación tenga algo que reescribir.
 */
function drawTurn(turnNo: number, tenpai: readonly PlayerId[]): CreateTurnInput {
  return {
    turnNo,
    wind: 'east',
    dealerId: P1,
    honba: 0,
    resultType: 'ryuukyoku',
    yaku: [],
    yakuHan: 0,
    doraCount: 0,
    fu: 0,
    tenpai: [...tenpai],
    riichiDeclaredBy: [],
    riichiSticks: 0,
    value: [],
    deltas: drawDeltas(tenpai),
    capturedBy: 'user-1',
    isRenchan: false,
    isFinalTurn: false,
    discarderId: null,
    chomboId: null,
    yakuHanOverride: 0,
  }
}

/** Los deltas que el motor daría a un empate: 3 000 entre los tenpai, a partes iguales. */
function drawDeltas(tenpai: readonly PlayerId[]): readonly PlayerDelta[] {
  const receivers = tenpai.length
  const payers = PLAYERS.length - receivers

  return PLAYERS.map(({ playerId }) => ({
    playerId,
    delta: tenpai.includes(playerId) ? 3000 / receivers : -3000 / payers,
  }))
}

/**
 * RF-9.6: corregir un turno de una partida **abierta** no cambia los resultados de esa partida
 * (mientras no esté finalizada no computa, RF-10.2), así que lo comprobable es que los
 * derivados de la temporada se vuelven a escribir con lo que dice el dominio.
 */
async function seasonWithOneFinalizedGame() {
  const season = await seasonsRepository.create({
    title: 'Temp 1',
    dateFrom: atDay(1),
    dateTo: atDay(30),
  })

  const finalized = await gamesRepository.create({
    seasonId: season.id,
    date: atDay(2),
    gameLength: 'tonpuusen',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: 25000,
    players: PLAYERS,
  })

  const results: readonly GameResultDoc[] = PLAYERS.map((player, index) => ({
    playerId: player.playerId,
    playerName: player.playerId,
    seat: player.seat,
    finalScore: 25000 + (index === 0 ? 1000 : 0) + (index === 3 ? -1000 : 0),
    finalPosition: index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : '4th',
    uma: index === 0 ? 30 : index === 1 ? 10 : index === 2 ? -10 : -30,
    chombo: false,
    bankrupt: false,
  }))

  const changes = writeBatch(fakeGetDb())
  changes.update(doc(fakeGetDb(), 'games', finalized.id), { status: 'finalized', results })
  await changes.commit()

  const { stats } = recalculate(season.id, [
    {
      gameId: finalized.id,
      seasonId: season.id,
      status: 'finalized',
      results: results.map((result) => ({
        playerId: result.playerId,
        playerName: result.playerName,
        seat: result.seat,
        score: result.finalScore - result.uma,
        chombo: result.chombo,
        bankrupt: result.bankrupt,
        position: result.finalPosition,
        uma: result.uma,
        finalScore: result.finalScore,
      })),
      hands: [],
    },
  ])

  return { season, stats }
}

describe('T68 · useGameTurns', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
  })

  it('registra un turno, lo devuelve y refresca la lista', async () => {
    const game = await openGame()
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value).toHaveLength(0)

      const deltas: readonly PlayerDelta[] = [{ playerId: toPlayerId('p1'), delta: -8000 }]
      const registered = await result.registerTurn.mutateAsync(chomboTurn(1, deltas))

      expect(registered.turnNo).toBe(1)
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))
      expect(result.data.value?.[0]?.deltas).toEqual(deltas)
    } finally {
      unmount()
    }
  })

  it('corrige un turno y refresca la lista', async () => {
    const game = await openGame()
    await turnsRepository.create(
      game.id,
      chomboTurn(1, [{ playerId: toPlayerId('p1'), delta: -8000 }]),
    )

    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))

      const corrected = await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { resultType: 'ryuukyoku' },
        by: 'user-2',
        expectedTurnCount: 1,
        expectedAuditCount: 0,
      })

      expect(corrected.resultType).toBe('ryuukyoku')
      await vi.waitFor(() =>
        expect(result.data.value?.find((t) => t.turnNo === 1)?.resultType).toBe('ryuukyoku'),
      )
    } finally {
      unmount()
    }
  })

  it('nextNumber devuelve el siguiente sin huecos', async () => {
    const game = await openGame()
    await turnsRepository.create(
      game.id,
      chomboTurn(1, [{ playerId: toPlayerId('p1'), delta: -8000 }]),
    )

    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      expect(await result.nextNumber()).toBe(2)
    } finally {
      unmount()
    }
  })

  it('registrar con un número que deja hueco propaga el DataError del repositorio', async () => {
    const game = await openGame()
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      const rejection = result.registerTurn.mutateAsync(
        chomboTurn(3, [{ playerId: toPlayerId('p1'), delta: -8000 }]),
      )
      await expect(rejection).rejects.toBeInstanceOf(DataError)
      await expect(rejection).rejects.toMatchObject({ code: 'gapInSequence' })
    } finally {
      unmount()
    }
  })

  it('registrar invalida la lista, el listado de abiertas y el detalle', async () => {
    const game = await openGame()
    const listSpy = vi.spyOn(turnsRepository, 'list')
    const openSpy = vi.fn(() => Promise.resolve([]))
    const detailSpy = vi.spyOn(gamesRepository, 'getById')

    const { result, unmount } = withColada(() => {
      const turns = useGameTurns(game.id)
      useQuery({ key: ['games', 'open'], query: openSpy })

      return turns
    })

    try {
      await vi.waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(1))
      await vi.waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
      // El detalle lo lee el propio composable, con la misma clave que la pantalla: se espía la
      // lectura real y no una query gemela, que la caché habría descartado por duplicada.
      await vi.waitFor(() => expect(detailSpy.mock.calls.length).toBeGreaterThanOrEqual(1))
      const detailReads = detailSpy.mock.calls.length

      await result.registerTurn.mutateAsync(
        chomboTurn(1, [{ playerId: toPlayerId('p1'), delta: -8000 }]),
      )

      await vi.waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2))
      await vi.waitFor(() => expect(openSpy).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(detailSpy.mock.calls.length).toBeGreaterThan(detailReads))
    } finally {
      unmount()
      listSpy.mockRestore()
      detailSpy.mockRestore()
    }
  })

  it('el borrador del turno sobrevive a recargar bajo localStorage (RF-15.8)', () => {
    const gameId = toGameId('g1')
    const draft = { resultType: 'tsumo', yaku: ['riichi'], doraCount: 2 }

    expect(saveTurnDraft(gameId, draft)).toBe(true)
    expect(loadTurnDraft(gameId)).toEqual(draft)

    clearTurnDraft(gameId)
    expect(loadTurnDraft(gameId)).toBeNull()
  })

  it('el borrador se expone en el composable con save/load/clear', async () => {
    const game = await openGame()
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      result.saveDraft({ wind: 'east' })
      expect(result.loadDraft()).toEqual({ wind: 'east' })

      result.clearDraft()
      expect(result.loadDraft()).toBeNull()
    } finally {
      unmount()
    }
  })

  it('un borrador corrupto se lee como null', () => {
    const gameId = toGameId('g1')

    localStorage.setItem('mahjongbu.turn-draft.g1', '{no-es-json')

    expect(loadTurnDraft(gameId)).toBeNull()
  })

  it('corregir un turno reescribe los derivados de la temporada (RF-9.6)', async () => {
    const { season, stats } = await seasonWithOneFinalizedGame()

    const open = await gamesRepository.create({
      seasonId: season.id,
      date: atDay(3),
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: PLAYERS,
    })
    await turnsRepository.create(
      open.id,
      chomboTurn(1, [{ playerId: toPlayerId('p1'), delta: -8000 }]),
    )

    const replaceSpy = vi.spyOn(playerSeasonStatsRepository, 'replaceForSeason')
    const { result, unmount } = withColada(() => useGameTurns(open.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))

      await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { resultType: 'ryuukyoku' },
        by: 'user-2',
        expectedTurnCount: 1,
        expectedAuditCount: 0,
      })

      expect(replaceSpy).toHaveBeenCalledTimes(1)
      expect(replaceSpy.mock.calls[0]?.[0]).toBe(season.id)
      expect(replaceSpy.mock.calls[0]?.[1]).toEqual(stats)
    } finally {
      unmount()
      replaceSpy.mockRestore()
    }
  })

  it('corregir un turno sin temporada no toca ningún derivado (RF-9.6)', async () => {
    const game = await openGame()
    await turnsRepository.create(
      game.id,
      chomboTurn(1, [{ playerId: toPlayerId('p1'), delta: -8000 }]),
    )

    const replaceSpy = vi.spyOn(playerSeasonStatsRepository, 'replaceForSeason')
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))

      await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { resultType: 'ryuukyoku' },
        by: 'user-2',
        expectedTurnCount: 1,
        expectedAuditCount: 0,
      })

      expect(replaceSpy).not.toHaveBeenCalled()
    } finally {
      unmount()
      replaceSpy.mockRestore()
    }
  })
})

/**
 * T29 · RF-18.7, RF-18.12, RF-18.14 y RF-19.4. Corregir un turno ya no es escribir encima: es
 * volver a derivar la partida desde ese punto y escribir **todo** —el corregido, los re-derivados
 * y los derivados de la temporada— en un único `WriteBatch`, de modo que un fallo no deje la
 * partida a medio recalcular.
 */
describe('T29 · correctTurn re-deriva', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
    createdBatches.length = 0
  })

  /**
   * Tres empates en los que el dealer es siempre quien ocupa el Este: guardados tal cual, los tres
   * tienen la misma localía y el mismo honba. Corregir el primero para que el dealer **pierda** la
   * tenpai hace que la localía avance y que los dos siguientes cambien de estado, que es lo que
   * hace comprobable la re-derivación.
   */
  async function threeDraws(): Promise<GameId> {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    await turnsRepository.create(game.id, drawTurn(2, [P2]))
    await turnsRepository.create(game.id, drawTurn(3, [P3]))

    return game.id
  }

  it('persiste el turno corregido y sus re-derivados en un único WriteBatch', async () => {
    const gameId = await threeDraws()
    const updateSpy = vi.spyOn(turnsRepository, 'update')
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))
      // Las siembras de arriba también abrieron su lote; aquí solo cuenta el de la mutación.
      createdBatches.length = 0

      await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { tenpai: [P2] },
        by: 'user-2',
        expectedTurnCount: 3,
        expectedAuditCount: 0,
      })

      // Un lote, tres escrituras de turno, y las tres con ese mismo lote.
      expect(createdBatches).toHaveLength(1)
      expect(updateSpy).toHaveBeenCalledTimes(3)
      const batch = createdBatches[0]
      expect(
        updateSpy.mock.calls.every((call) => call[3]?.batch === batch),
        'alguna escritura se fue en otro lote',
      ).toBe(true)

      const stored = await turnsRepository.list(gameId)

      expect(stored.map((turn) => turn.turnNo)).toStrictEqual([1, 2, 3])
      expect(stored.map((turn) => turn.honba)).toStrictEqual([0, 0, 1])
      /**
       * El dealer solo avanza en el turno 1 y en el 3: en el 2 es quien está en tenpai, así que
       * conserva la localía. Por eso la secuencia es `p1, p2, p2` y no `p1, p2, p3` - y por eso un
       * barrido escrito a ojo se equivoca antes que el motor. El contador solo sube cuando la localía
       * se conserva, así que los tres turnos lo llevan a 0 menos el último, que hereda el renchan del 2.
       */
      expect(stored.map((turn) => turn.dealerId)).toStrictEqual([P1, P2, P2])
    } finally {
      unmount()
      updateSpy.mockRestore()
    }
  })

  it('cada turno re-derivado lleva su propia entrada de registro, marcada como derivada', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { tenpai: [P2] },
        by: 'user-7',
        expectedTurnCount: 3,
        expectedAuditCount: 0,
      })

      const stored = await turnsRepository.list(gameId)
      const rederived = stored[1]
      const entry = rederived?.audit[0]

      expect(rederived?.updatedBy).toBe('user-7')
      expect(entry?.action).toBe('correct')
      expect(entry?.by).toBe('user-7')
      expect(entry && 'changes' in entry ? entry.changes : undefined).toStrictEqual([
        { field: 'dealerId', from: P1, to: P2, derived: true },
      ])
    } finally {
      unmount()
    }
  })

  it('el turno corregido distingue lo que escribió una persona de lo que calculó el sistema', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      const corrected = await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { tenpai: [P2] },
        by: 'user-7',
        expectedTurnCount: 3,
        expectedAuditCount: 0,
      })

      const entry = corrected.audit[0]

      expect(entry && 'changes' in entry ? entry.changes : undefined).toStrictEqual([
        { field: 'tenpai', from: [P1], to: [P2], derived: false },
        {
          field: 'deltas',
          from: drawDeltas([P1]),
          to: drawDeltas([P2]),
          derived: true,
        },
      ])
      expect(corrected.capturedBy).toBe('user-1')
    } finally {
      unmount()
    }
  })

  it('un turno anterior al corregido no se toca', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await result.correctTurn.mutateAsync({
        turnNo: 2,
        patch: { tenpai: [P3] },
        by: 'user-2',
        expectedTurnCount: 3,
        expectedAuditCount: 0,
      })

      const stored = await turnsRepository.list(gameId)

      expect(stored[0]?.audit).toStrictEqual([])
      expect(stored[1]?.dealerId).toBe(P1)
      expect(stored[1]?.honba).toBe(1)
    } finally {
      unmount()
    }
  })

  it('reescribe los derivados de la temporada con los turnos re-derivados', async () => {
    const season = await seasonsRepository.create({
      title: 'Temp 1',
      dateFrom: atDay(1),
      dateTo: atDay(30),
    })
    const game = await gamesRepository.create({
      seasonId: season.id,
      date: atDay(3),
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: PLAYERS,
    })

    for (const [index, tenpai] of [[P1], [P2], [P3]].entries()) {
      await turnsRepository.create(game.id, drawTurn(index + 1, tenpai))
    }

    const replaceSpy = vi.spyOn(playerSeasonStatsRepository, 'replaceForSeason')
    const rankingsSpy = vi.spyOn(rankingsRepository, 'replaceForSeason')
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))
      createdBatches.length = 0

      await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { tenpai: [P2] },
        by: 'user-2',
        expectedTurnCount: 3,
        expectedAuditCount: 0,
      })

      expect(replaceSpy).toHaveBeenCalledTimes(1)
      expect(rankingsSpy).toHaveBeenCalledTimes(1)
      expect(replaceSpy.mock.calls[0]?.[2]).toBe(createdBatches[0])
      expect(rankingsSpy.mock.calls[0]?.[2]).toBe(createdBatches[0])
    } finally {
      unmount()
      replaceSpy.mockRestore()
      rankingsSpy.mockRestore()
    }
  })

  it('una corrección que deja un turno posterior inválido se rechaza entera sin escribir nada', async () => {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    await turnsRepository.create(game.id, {
      ...drawTurn(2, []),
      resultType: 'ron',
      discarderId: null,
      value: [{ playerId: P2, han: 1, fu: 30, basicPoints: 320, points: 1300, deltas: [] }],
    })

    const updateSpy = vi.spyOn(turnsRepository, 'update')
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(2))

      const rejected = result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { tenpai: [P2] },
        by: 'user-2',
        expectedTurnCount: 2,
        expectedAuditCount: 0,
      })

      await expect(rejected).rejects.toMatchObject({ code: 'replayInvalid' })
      await expect(rejected).rejects.toThrow(/turno 2/)

      expect(updateSpy).not.toHaveBeenCalled()
      const stored = await turnsRepository.list(game.id)

      expect(stored[0]?.tenpai).toStrictEqual([P1])
      expect(stored[0]?.audit).toStrictEqual([])
      expect(stored[1]?.audit).toStrictEqual([])
    } finally {
      unmount()
      updateSpy.mockRestore()
    }
  })

  it('recalcula el cierre por bancarrota en la misma operación (RF-18.11)', async () => {
    const game = await gamesRepository.create({
      seasonId: null,
      date: atDay(1),
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 5000,
      players: PLAYERS,
    })
    await turnsRepository.create(game.id, drawTurn(1, [P1]))

    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))

      await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { resultType: 'chombo', chomboId: P4, tenpai: [] },
        by: 'user-2',
        expectedTurnCount: 1,
        expectedAuditCount: 0,
      })

      const stored = await gamesRepository.getById(game.id)

      expect(stored?.mustFinalize).toBe(true)
      expect(stored?.status).toBe('open')
    } finally {
      unmount()
    }
  })
})

/**
 * T30 · RF-18.9, RF-18.10 y RF-18.12. Borrar un turno intermedio no es quitar un documento: es
 * cerrar el hueco renumerando los siguientes, volver a derivarlos desde el estado que quedó en el
 * turno anterior y dejar el registro del borrado donde puede sobrevivir.
 */
describe('T30 · deleteTurn', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
    createdBatches.length = 0
  })

  async function threeDraws(): Promise<GameId> {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    await turnsRepository.create(game.id, drawTurn(2, [P2]))
    await turnsRepository.create(game.id, drawTurn(3, [P3]))

    return game.id
  }

  it('borra el turno intermedio, renumera los siguientes y los re-deriva', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      const remaining = await result.deleteTurn.mutateAsync({
        turnNo: 2,
        by: 'user-2',
        expectedTurnCount: 3,
      })

      expect(remaining.map((turn) => turn.turnNo)).toStrictEqual([1, 2])

      const stored = await turnsRepository.list(gameId)

      expect(stored.map((turn) => turn.turnNo)).toStrictEqual([1, 2])
      expect(stored[1]?.honba).toBe(1)
      expect(stored[1]?.tenpai).toStrictEqual([P3])
      expect(stored[1]?.capturedBy).toBe('user-1')
      expect(stored[1]?.updatedBy).toBe('user-2')
      expect(await turnsRepository.nextNumber(gameId)).toBe(3)
    } finally {
      unmount()
    }
  })

  it('deja el registro del borrado en el turno anterior, con los valores que tenía', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await result.deleteTurn.mutateAsync({
        turnNo: 2,
        by: 'user-5',
        expectedTurnCount: 3,
      })

      const first = (await turnsRepository.list(gameId))[0]
      const entry = first?.audit[0]

      expect(entry?.action).toBe('delete')
      expect(entry?.by).toBe('user-5')
      expect(entry && 'turnNo' in entry ? entry.turnNo : undefined).toBe(2)
      expect(entry && 'before' in entry ? entry.before.tenpai : undefined).toStrictEqual([P2])
      expect(entry && 'before' in entry ? entry.before.capturedBy : undefined).toBe('user-1')
    } finally {
      unmount()
    }
  })

  it('borrar el primer turno deja su registro en la partida (RF-19.7)', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await result.deleteTurn.mutateAsync({
        turnNo: 1,
        by: 'user-5',
        expectedTurnCount: 3,
      })

      const stored = await turnsRepository.list(gameId)
      const game = await gamesRepository.getById(gameId)

      expect(stored.map((turn) => turn.turnNo)).toStrictEqual([1, 2])
      expect(stored[0]?.audit).toStrictEqual([])
      expect(game?.turnAudit).toHaveLength(1)
      expect(game?.turnAudit[0]?.turnNo).toBe(1)
      expect(game?.turnAudit[0]?.by).toBe('user-5')
      expect(game?.turnAudit[0]?.before.resultType).toBe('ryuukyoku')
    } finally {
      unmount()
    }
  })

  it('borrar dos turnos seguidos deja el segundo en la partida, que ya no tiene anterior', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await result.deleteTurn.mutateAsync({
        turnNo: 1,
        by: 'user-5',
        expectedTurnCount: 3,
      })
      await result.deleteTurn.mutateAsync({
        turnNo: 1,
        by: 'user-6',
        expectedTurnCount: 2,
      })

      const game = await gamesRepository.getById(gameId)
      const stored = await turnsRepository.list(gameId)

      expect(stored.map((turn) => turn.turnNo)).toStrictEqual([1])
      expect(game?.turnAudit.map((entry) => entry.by)).toStrictEqual(['user-5', 'user-6'])
    } finally {
      unmount()
    }
  })

  it('borrar el último turno deja el número libre para volver a capturarlo (RF-18.10)', async () => {
    const gameId = await threeDraws()
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await result.deleteTurn.mutateAsync({
        turnNo: 3,
        by: 'user-2',
        expectedTurnCount: 3,
      })

      expect(await result.nextNumber()).toBe(3)
      expect((await result.registerTurn.mutateAsync(drawTurn(3, [P4]))).turnNo).toBe(3)
      expect((await turnsRepository.list(gameId)).map((turn) => turn.turnNo)).toStrictEqual([
        1, 2, 3,
      ])
    } finally {
      unmount()
    }
  })

  it('borra y renumera y reescribe los derivados de la temporada en un único lote', async () => {
    const season = await seasonsRepository.create({
      title: 'Temp 1',
      dateFrom: atDay(1),
      dateTo: atDay(30),
    })
    const game = await gamesRepository.create({
      seasonId: season.id,
      date: atDay(3),
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: PLAYERS,
    })

    for (const [index, tenpai] of [[P1], [P2], [P3]].entries()) {
      await turnsRepository.create(game.id, drawTurn(index + 1, tenpai))
    }

    const removeSpy = vi.spyOn(turnsRepository, 'remove')
    const updateSpy = vi.spyOn(turnsRepository, 'update')
    const replaceSpy = vi.spyOn(playerSeasonStatsRepository, 'replaceForSeason')
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))
      createdBatches.length = 0

      await result.deleteTurn.mutateAsync({
        turnNo: 2,
        by: 'user-2',
        expectedTurnCount: 3,
      })

      expect(createdBatches).toHaveLength(1)
      const batch = createdBatches[0]

      expect(removeSpy.mock.calls[0]?.[2]).toBe(batch)
      expect(updateSpy.mock.calls.every((call) => call[3]?.batch === batch)).toBe(true)
      expect(replaceSpy.mock.calls[0]?.[2]).toBe(batch)
    } finally {
      unmount()
      removeSpy.mockRestore()
      updateSpy.mockRestore()
      replaceSpy.mockRestore()
    }
  })

  it('borrar un turno que no existe no escribe nada', async () => {
    const gameId = await threeDraws()
    const removeSpy = vi.spyOn(turnsRepository, 'remove')
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await expect(
        result.deleteTurn.mutateAsync({ turnNo: 7, by: 'user-2', expectedTurnCount: 3 }),
      ).rejects.toMatchObject({ code: 'notFound' })
      expect(removeSpy).not.toHaveBeenCalled()
    } finally {
      unmount()
      removeSpy.mockRestore()
    }
  })
})

/**
 * T34 · RF-18.1 y RF-23.3. La ronda, la localía y el honba dejan de capturarse: el composable los
 * deriva con `domain/replay.ts` y los expone, y el formulario solo los muestra. Si el recorrido
 * rechaza —una partida que no se puede reproducir— no hay estado que enseñar y se devuelve `null`.
 */
describe('T34 · el estado derivado de la mano siguiente', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
    createdBatches.length = 0
  })

  async function seeded(turnCount: number): Promise<GameId> {
    const game = await openGame()
    const hands: readonly (readonly PlayerId[])[] = [[P1], [P2], [P3], [P4]]

    for (const [index, tenpai] of hands.entries()) {
      if (index >= turnCount) {
        break
      }

      await turnsRepository.create(game.id, drawTurn(index + 1, tenpai))
    }

    return game.id
  }

  it('sin turnos, el estado es el inicial de la partida', async () => {
    const gameId = await openGame().then((game) => game.id)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      await vi.waitFor(() => expect(result.nextHand.value).not.toBeNull())

      expect(result.nextHand.value).toStrictEqual({ wind: 'east', dealer: 'east', honba: 0 })
    } finally {
      unmount()
    }
  })

  it('avanza con los turnos guardados: la localía y el honba los pone el sistema', async () => {
    const gameId = await seeded(3)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))
      await vi.waitFor(() => expect(result.nextHand.value?.dealer).toBe('west'))

      expect(result.nextHand.value).toStrictEqual({ wind: 'east', dealer: 'west', honba: 0 })
    } finally {
      unmount()
    }
  })

  it('es null cuando la partida no se puede reproducir', async () => {
    const game = await openGame()
    await turnsRepository.create(game.id, {
      ...drawTurn(1, []),
      resultType: 'ron',
      discarderId: null,
      value: [{ playerId: P2, han: 1, fu: 30, basicPoints: 320, points: 1300, deltas: [] }],
    })

    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))
      await vi.waitFor(() => expect(result.nextHand.value).toBeNull())

      expect(result.nextHand.value).toBeNull()
    } finally {
      unmount()
    }
  })
})

/**
 * T32 · RF-19.15 y RF-19.16. Con la caché local, «lo que hay en el cliente» puede ser anterior a
 * «lo que hay en el servidor». Re-derivar sobre ese estado daría un resultado incorrecto y en
 * silencio, así que se rechaza y se pide sincronizar — y el rechazo **no** se lleva por delante el
 * borrador ni la captura pendiente.
 */
describe('T32 · estado desfasado', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
    createdBatches.length = 0
  })

  it('rechaza con staleLocal si el número de turnos no es el que se leyó', async () => {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    const updateSpy = vi.spyOn(turnsRepository, 'update')
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))

      // Otro dispositivo capturó un turno más mientras este iba sin conexión.
      await turnsRepository.create(game.id, drawTurn(2, [P2]))

      await expect(
        result.correctTurn.mutateAsync({
          turnNo: 1,
          patch: { tenpai: [P2] },
          by: 'user-2',
          expectedTurnCount: 1,
          expectedAuditCount: 0,
        }),
      ).rejects.toMatchObject({ code: 'staleLocal' })
      expect(updateSpy).not.toHaveBeenCalled()
    } finally {
      unmount()
      updateSpy.mockRestore()
    }
  })

  it('rechaza con staleLocal si las correcciones del turno no son las que se leyeron', async () => {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))

      await turnsRepository.update(game.id, 1, { fu: 30 }, { by: 'otro', expectedAuditCount: 0 })

      await expect(
        result.correctTurn.mutateAsync({
          turnNo: 1,
          patch: { tenpai: [P2] },
          by: 'user-2',
          expectedTurnCount: 1,
          expectedAuditCount: 0,
        }),
      ).rejects.toMatchObject({ code: 'staleLocal' })
    } finally {
      unmount()
    }
  })

  it('borrar con el estado desfasado también se rechaza y no borra nada', async () => {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    await turnsRepository.create(game.id, drawTurn(2, [P2]))
    const removeSpy = vi.spyOn(turnsRepository, 'remove')
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(2))

      await expect(
        result.deleteTurn.mutateAsync({ turnNo: 1, by: 'user-2', expectedTurnCount: 1 }),
      ).rejects.toMatchObject({ code: 'staleLocal' })
      expect(removeSpy).not.toHaveBeenCalled()
    } finally {
      unmount()
      removeSpy.mockRestore()
    }
  })

  it('el rechazo por estado desfasado no se lleva por delante el borrador (RF-19.16)', async () => {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))
      result.saveDraft({ resultType: 'tsumo', yaku: ['riichi'], doraCount: 2 })
      await turnsRepository.create(game.id, drawTurn(2, [P2]))

      await expect(
        result.correctTurn.mutateAsync({
          turnNo: 1,
          patch: { tenpai: [P2] },
          by: 'user-2',
          expectedTurnCount: 1,
          expectedAuditCount: 0,
        }),
      ).rejects.toMatchObject({ code: 'staleLocal' })

      expect(result.loadDraft()).toStrictEqual({
        resultType: 'tsumo',
        yaku: ['riichi'],
        doraCount: 2,
      })
    } finally {
      unmount()
    }
  })

  it('el rechazo por estado desfasado no borra la captura pendiente del otro dispositivo', async () => {
    const game = await openGame()
    await turnsRepository.create(game.id, drawTurn(1, [P1]))
    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))
      await turnsRepository.create(game.id, drawTurn(2, [P2]))

      await expect(
        result.correctTurn.mutateAsync({
          turnNo: 1,
          patch: { tenpai: [P2] },
          by: 'user-2',
          expectedTurnCount: 1,
          expectedAuditCount: 0,
        }),
      ).rejects.toMatchObject({ code: 'staleLocal' })

      expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])
    } finally {
      unmount()
    }
  })
})

/**
 * RF-18.18 con la decisión del club: una partida marcada por bancarrota se finaliza, y no se
 * corrige. Lo único que se puede hacer sobre sus turnos es **borrar el último**, porque ese borrado
 * es el que puede levantar la marca —caso límite 18 y RF-18.19—. Si el borrado no la levanta, la
 * partida sigue sin más camino que finalizarse, y eso también es lo que dice el club.
 */
describe('la bancarrota se levanta borrando el último turno', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
    createdBatches.length = 0
  })

  /**
   * Una partida de 5 000 puntos en la que solo el último turno deja a alguien por debajo de cero:
   * los empates anteriores reparten 1 000 entre los tenpai y el chombo final manda a P4 a −5 000.
   * Los 5 000 no son un detalle —con 1 000 el primer empate ya dejaría a los tres perdedores en
   * negativo, y la partida estaría marcada antes de tiempo—. Marcarla a mano evita que el test
   * dependa de `correctTurn` para llegar al estado que quiere medir.
   */
  async function markedWithBankruptLastTurn(turnCount: number): Promise<GameId> {
    const game = await gamesRepository.create({
      seasonId: null,
      date: atDay(1),
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 5000,
      players: PLAYERS,
    })

    for (let turnNo = 1; turnNo < turnCount; turnNo += 1) {
      await turnsRepository.create(game.id, drawTurn(turnNo, [P1]))
    }

    await turnsRepository.create(game.id, {
      ...drawTurn(turnCount, []),
      resultType: 'chombo',
      chomboId: P4,
      tenpai: [],
      deltas: [{ playerId: P4, delta: -8000 }],
    })

    await gamesRepository.update(game.id, { mustFinalize: true })

    return game.id
  }

  it('corregir una partida marcada se rechaza y no escribe nada', async () => {
    const gameId = await markedWithBankruptLastTurn(3)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await expect(
        result.correctTurn.mutateAsync({
          turnNo: 1,
          patch: { tenpai: [P2] },
          by: 'user-2',
          expectedTurnCount: 3,
          expectedAuditCount: 0,
        }),
      ).rejects.toMatchObject({ code: 'gameMarked' })

      const stored = await turnsRepository.list(gameId)

      expect(stored.map((turn) => turn.turnNo)).toStrictEqual([1, 2, 3])
      expect(stored[0]?.tenpai).toStrictEqual([P1])
      expect(stored.every((turn) => turn.audit.length === 0)).toBe(true)
    } finally {
      unmount()
    }
  })

  it('registrar un turno nuevo en una partida marcada se rechaza', async () => {
    const gameId = await markedWithBankruptLastTurn(2)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(2))

      await expect(result.registerTurn.mutateAsync(drawTurn(3, [P1]))).rejects.toMatchObject({
        code: 'gameMarked',
      })
      expect((await turnsRepository.list(gameId)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])
    } finally {
      unmount()
    }
  })

  it('borrar un turno que no es el último se rechaza y no borra nada', async () => {
    const gameId = await markedWithBankruptLastTurn(3)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      await expect(
        result.deleteTurn.mutateAsync({ turnNo: 1, by: 'user-2', expectedTurnCount: 3 }),
      ).rejects.toMatchObject({ code: 'gameMarked' })

      expect((await turnsRepository.list(gameId)).map((turn) => turn.turnNo)).toStrictEqual([
        1, 2, 3,
      ])
      expect((await gamesRepository.getById(gameId))?.mustFinalize).toBe(true)
    } finally {
      unmount()
    }
  })

  it('borrar el último turno levanta la marca cuando la partida queda limpia', async () => {
    const gameId = await markedWithBankruptLastTurn(3)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))

      const remaining = await result.deleteTurn.mutateAsync({
        turnNo: 3,
        by: 'user-2',
        expectedTurnCount: 3,
      })

      expect(remaining.map((turn) => turn.turnNo)).toStrictEqual([1, 2])
      expect((await turnsRepository.list(gameId)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])

      const game = await gamesRepository.getById(gameId)

      expect(game?.status).toBe('open')
      expect(game?.mustFinalize).toBe(false)
    } finally {
      unmount()
    }
  })

  it('borrar el último turno deja la marca si alguien sigue por debajo de cero', async () => {
    const game = await gamesRepository.create({
      seasonId: null,
      date: atDay(1),
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 1000,
      players: PLAYERS,
    })

    // Los dos turnos son chombos: borrar el último deja a P4 en −7 000.
    for (const turnNo of [1, 2]) {
      await turnsRepository.create(game.id, {
        ...drawTurn(turnNo, []),
        resultType: 'chombo',
        chomboId: P4,
        tenpai: [],
        deltas: [{ playerId: P4, delta: -8000 }],
      })
    }

    await gamesRepository.update(game.id, { mustFinalize: true })

    const { result, unmount } = withColada(() => useGameTurns(game.id))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(2))

      await result.deleteTurn.mutateAsync({ turnNo: 2, by: 'user-2', expectedTurnCount: 2 })

      expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1])
      expect((await gamesRepository.getById(game.id))?.mustFinalize).toBe(true)
    } finally {
      unmount()
    }
  })

  it('levantada la marca, corregir vuelve a funcionar', async () => {
    const gameId = await markedWithBankruptLastTurn(3)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(3))
      await result.deleteTurn.mutateAsync({ turnNo: 3, by: 'user-2', expectedTurnCount: 3 })

      const corrected = await result.correctTurn.mutateAsync({
        turnNo: 1,
        patch: { tenpai: [P2] },
        by: 'user-3',
        expectedTurnCount: 2,
        expectedAuditCount: 0,
      })

      expect(corrected.tenpai).toStrictEqual([P2])
      expect((await gamesRepository.getById(gameId))?.mustFinalize).toBe(false)
    } finally {
      unmount()
    }
  })

  it('el rechazo de una partida marcada no borra el borrador ni la captura pendiente', async () => {
    const gameId = await markedWithBankruptLastTurn(2)
    const { result, unmount } = withColada(() => useGameTurns(gameId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(2))
      result.saveDraft({ resultType: 'tsumo', yaku: ['riichi'], doraCount: 2 })

      await expect(
        result.correctTurn.mutateAsync({
          turnNo: 1,
          patch: { tenpai: [P2] },
          by: 'user-2',
          expectedTurnCount: 2,
          expectedAuditCount: 0,
        }),
      ).rejects.toMatchObject({ code: 'gameMarked' })

      expect(result.loadDraft()).toStrictEqual({
        resultType: 'tsumo',
        yaku: ['riichi'],
        doraCount: 2,
      })
      expect((await turnsRepository.list(gameId)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])
    } finally {
      unmount()
    }
  })
})
