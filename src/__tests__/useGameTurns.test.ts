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
import { seasonsRepository } from '@/data/seasons.repository'
import { turnsRepository } from '@/data/turns.repository'
import { recalculate } from '@/domain/stats/recalculate'
import type { PlayerDelta } from '@/domain/turn'
import { toGameId, toPlayerId } from '@/domain/types'
import type { GameId } from '@/domain/types'
import { doc, fakeGetDb, fakeReset, writeBatch } from '@/test-utils/fakeFirestore'
import { withColada } from '@/test-utils/colada'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
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
  }
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
    const detailSpy = vi.fn(() => Promise.resolve({ status: 'open' }))

    const { result, unmount } = withColada(() => {
      const turns = useGameTurns(game.id)
      useQuery({ key: ['games', 'open'], query: openSpy })
      useQuery({ key: ['games', 'detail', game.id], query: detailSpy })

      return turns
    })

    try {
      await vi.waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(1))
      await vi.waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(detailSpy).toHaveBeenCalledTimes(1))

      await result.registerTurn.mutateAsync(
        chomboTurn(1, [{ playerId: toPlayerId('p1'), delta: -8000 }]),
      )

      await vi.waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2))
      await vi.waitFor(() => expect(openSpy).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(detailSpy).toHaveBeenCalledTimes(2))
    } finally {
      unmount()
      listSpy.mockRestore()
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

      await result.correctTurn.mutateAsync({ turnNo: 1, patch: { resultType: 'ryuukyoku' } })

      expect(replaceSpy).not.toHaveBeenCalled()
    } finally {
      unmount()
      replaceSpy.mockRestore()
    }
  })
})
