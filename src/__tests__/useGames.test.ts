import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameDetail, useGames } from '@/composables/useGames'
import { usePlayerSeasonStats } from '@/composables/usePlayerSeasonStats'
import { useRankings } from '@/composables/useRankings'
import { DataError } from '@/data/errors'
import { gamesRepository } from '@/data/games.repository'
import type { CreateGameInput, GameParticipant } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { turnsRepository } from '@/data/turns.repository'
import type { PlayerDelta, TurnValue } from '@/domain/turn'
import { type Seat, toGameId, toPlayerId, toSeasonId } from '@/domain/types'
import type { GameId, SeasonId } from '@/domain/types'
import { fakeAdvanceSeconds, fakeNow, fakeReset } from '@/test-utils/fakeFirestore'
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

const SEATS: readonly Seat[] = ['east', 'south', 'west', 'north']
const PLAYERS = SEATS.map((seat, index) => ({
  playerId: toPlayerId(`p${index + 1}`),
  seat,
}))

/** Crea los cuatro jugadores reales y devuelve la mesa con sus IDs persistidos. */
async function seededTable() {
  const names = ['Ana', 'Bob', 'Carla', 'David']
  const players = []

  for (const [index, name] of names.entries()) {
    const created = await playersRepository.create({
      externalId: `external-${index + 1}`,
      name,
    })

    players.push(created)
  }

  return {
    table: players.map((player, index) => ({
      playerId: player.id,
      seat: SEATS[index] as Seat,
    })),
    names: Object.fromEntries(players.map((player) => [player.id, player.name])),
  }
}

async function seedSeason(): Promise<SeasonId> {
  const season = await seasonsRepository.create({
    title: 'Primera',
    dateFrom: atDay(1),
    dateTo: atDay(9),
  })

  return season.id
}

async function openGame(overrides?: Partial<CreateGameInput>) {
  return gamesRepository.create({
    seasonId: overrides?.seasonId ?? null,
    date: overrides?.date ?? atDay(1),
    gameLength: 'tonpuusen',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: overrides?.startPoints ?? 25000,
    players: overrides?.players ?? PLAYERS,
  })
}

function tsumoTurn(
  turnNo: number,
  table: readonly GameParticipant[] = PLAYERS,
): Parameters<typeof turnsRepository.create>[1] {
  const winner = (table[0] as GameParticipant).playerId
  const others = table.slice(1).map(({ playerId }) => ({ playerId, delta: -1000 }) as const)
  const deltas: readonly PlayerDelta[] = [{ playerId: winner, delta: 3000 }, ...others]
  const value: readonly TurnValue[] = [
    { playerId: winner, han: 1, fu: 30, basicPoints: 2000, points: 3000, deltas },
  ]

  return {
    turnNo,
    wind: 'east',
    dealerId: winner,
    honba: 0,
    resultType: 'tsumo',
    yaku: ['riichi'],
    yakuHan: 1,
    doraCount: 2,
    fu: 30,
    tenpai: [winner],
    riichiDeclaredBy: [winner],
    riichiSticks: 0,
    value,
    deltas,
    capturedBy: 'user-1',
    isRenchan: false,
    isFinalTurn: turnNo === 4,
  }
}

async function fullGame(
  seasonId: SeasonId,
  table: readonly GameParticipant[] = PLAYERS,
): Promise<GameId> {
  const game = await openGame({ seasonId, players: table })

  for (const turnNo of [1, 2, 3, 4]) {
    await turnsRepository.create(game.id, tsumoTurn(turnNo, table))
  }

  return game.id
}

describe('T67 · useGames', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('expone la lista por temporada y el listado de abiertas', async () => {
    const seasonId = toSeasonId('s1')
    await openGame({ seasonId })

    const { result, unmount } = withColada(() => useGames(seasonId))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value).toHaveLength(1)
      expect(result.data.value?.[0]?.status).toBe('open')

      await vi.waitFor(() => expect(result.openGames.state.value.status).toBe('success'))
      expect(result.openGames.data.value).toHaveLength(1)
    } finally {
      unmount()
    }
  })

  it('finaliza con el mínimo de turnos y escribe resultados, audit y derivados', async () => {
    const { table } = await seededTable()
    const seasonId = await seedSeason()
    const gameId = await fullGame(seasonId, table)

    const { result, unmount } = withColada(() => {
      const games = useGames(seasonId)
      const stats = usePlayerSeasonStats(seasonId)
      const rankings = useRankings(seasonId)

      return { games, stats, rankings }
    })

    try {
      await vi.waitFor(() => expect(result.games.data.value).toHaveLength(1))
      await vi.waitFor(() => expect(result.stats.state.value.status).toBe('success'))
      await vi.waitFor(() => expect(result.rankings.state.value.status).toBe('success'))
      expect(result.stats.data.value).toHaveLength(0)
      expect(result.rankings.data.value).toHaveLength(0)

      const game = await result.games.finalizeGame.mutateAsync({ gameId, by: 'user-1' })

      expect(game.status).toBe('finalized')
      expect(game.finalizationAudit).toHaveLength(1)
      expect(game.finalizationAudit[0]?.action).toBe('finalize')
      expect(game.results).toHaveLength(4)

      const p1 = game.results.find((r) => r.playerId === table[0]?.playerId)
      const p4 = game.results.find((r) => r.playerId === table[3]?.playerId)

      expect(p1).toMatchObject({
        playerName: 'Ana',
        finalScore: 37030,
        finalPosition: '1st',
        uma: 30,
        bankrupt: false,
      })
      expect(p4).toMatchObject({ finalScore: 20970, finalPosition: '4th' })

      const unstamped = await gamesRepository.getById(gameId)

      expect(unstamped).not.toBeNull()
      expect(unstamped?.status).toBe('finalized')
      expect(unstamped?.results).toHaveLength(4)
      expect(unstamped?.results[0]?.playerName).toBe('Ana')

      await vi.waitFor(() => expect(result.stats.data.value).toHaveLength(4))
      const stat = result.stats.data.value?.find((entry) => entry.playerId === table[0]?.playerId)

      expect(stat).toMatchObject({ actualPoints: 37030, gamesPlayed: 1, victories: 1 })
      expect(stat?.positions?.['1st']).toBe(1)

      await vi.waitFor(() => expect(result.rankings.data.value).toHaveLength(4))
      const first = result.rankings.data.value?.find((entry) => entry.rank === 1)

      expect(first).toMatchObject({ playerId: table[0]?.playerId, points: 37030 })
    } finally {
      unmount()
    }
  })

  it('finalizar por debajo del mínimo aborta sin reescribir derivados (RF-9.2)', async () => {
    const seasonId = await seedSeason()
    const gameId = await openGame({ seasonId }).then((game) => game.id)

    for (const turnNo of [1, 2]) {
      await turnsRepository.create(gameId, tsumoTurn(turnNo))
    }

    const { result, unmount } = withColada(() => {
      const games = useGames(seasonId)
      const stats = usePlayerSeasonStats(seasonId)

      return { games, stats }
    })

    try {
      await vi.waitFor(() => expect(result.games.data.value).toHaveLength(1))

      const game = await result.games.finalizeGame.mutateAsync({ gameId, by: 'user-1' })

      expect(game.status).toBe('aborted')
      expect(game.results).toHaveLength(0)
      expect(game.finalizationAudit).toHaveLength(1)

      expect(result.stats.data.value).toHaveLength(0)
    } finally {
      unmount()
    }
  })

  it('deshacer la finalización vuelve a abrir, resetea resultados y recalcula', async () => {
    const seasonId = await seedSeason()
    const gameId = await fullGame(seasonId)

    const { result, unmount } = withColada(() => {
      const games = useGames(seasonId)
      const stats = usePlayerSeasonStats(seasonId)

      return { games, stats }
    })

    try {
      await vi.waitFor(() => expect(result.games.data.value).toHaveLength(1))
      await result.games.finalizeGame.mutateAsync({ gameId, by: 'user-1' })

      await vi.waitFor(() => expect(result.stats.data.value).toHaveLength(4))

      await result.games.unfinalizeGame.mutateAsync({ gameId, by: 'user-2' })

      const reopened = await gamesRepository.getById(gameId)

      expect(reopened).not.toBeNull()
      expect(reopened?.status).toBe('open')
      expect(reopened?.results).toHaveLength(0)
      expect(reopened?.finalizationAudit).toHaveLength(2)
      expect(reopened?.finalizationAudit[1]).toMatchObject({ action: 'unfinalize', by: 'user-2' })

      await vi.waitFor(() => expect(result.stats.data.value).toHaveLength(0))
    } finally {
      unmount()
    }
  })

  it('crea una partida e invalida el listado por temporada', async () => {
    const seasonId = await seedSeason()
    const { result, unmount } = withColada(() => useGames(seasonId))

    try {
      await vi.waitFor(() => expect(result.data.value).toHaveLength(0))

      await result.createGame.mutateAsync({
        seasonId,
        date: atDay(2),
        gameLength: 'tonpuusen',
        ruleset: 'mahjongSouls',
        rulesetVersion: '1.0',
        startPoints: 25000,
        players: PLAYERS,
      })

      await vi.waitFor(() => expect(result.data.value).toHaveLength(1))
      expect(result.data.value?.[0]?.status).toBe('open')
    } finally {
      unmount()
    }
  })

  it('abandonar exige más de 7 días de inactividad (RF-10.4)', async () => {
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    const gameId = await openGame().then((game) => game.id)

    const { result, unmount } = withColada(() => useGames())

    try {
      await vi.waitFor(() => expect(result.openGames.data.value).toHaveLength(1))

      await expect(result.abandonGame.mutateAsync(gameId)).rejects.toBeInstanceOf(DataError)
      await expect(result.abandonGame.mutateAsync(gameId)).rejects.toMatchObject({
        code: 'notOpen',
      })

      fakeAdvanceSeconds(8 * DAY)
      vi.setSystemTime(new Date(fakeNow().seconds * 1000))

      const abandoned = await result.abandonGame.mutateAsync(gameId)

      expect(abandoned.status).toBe('unfinished')

      const stored = await gamesRepository.getById(gameId)

      expect(stored).not.toBeNull()
      expect(stored?.status).toBe('unfinished')
      await vi.waitFor(() => expect(result.openGames.data.value).toHaveLength(0))
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('una partida abandonada conserva el bote sin reclamar y no se adjudica a nadie (RF-5.7)', async () => {
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    const game = await openGame()

    // Un empate con riichi declarado deja las fichas en el bote; nadie las ha reclamado.
    await turnsRepository.create(game.id, {
      ...tsumoTurn(1),
      resultType: 'ryuukyoku',
      value: [],
      deltas: [],
      riichiSticks: 2,
    })

    const { result, unmount } = withColada(() => useGames())

    try {
      await vi.waitFor(() => expect(result.openGames.data.value).toHaveLength(1))

      fakeAdvanceSeconds(8 * DAY)
      vi.setSystemTime(new Date(fakeNow().seconds * 1000))

      const abandoned = await result.abandonGame.mutateAsync(game.id)

      expect(abandoned.status).toBe('unfinished')
      expect(abandoned.results).toHaveLength(0)

      const turns = await turnsRepository.list(game.id)
      expect(turns).toHaveLength(1)
      expect(turns[0]?.riichiSticks).toBe(2)
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('useGameDetail expone la partida y su estado', async () => {
    const gameId = await openGame().then((game) => game.id)

    const { result, unmount } = withColada(() => useGameDetail(gameId))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value?.status).toBe('open')
      expect(result.data.value?.id).toBe(toGameId(gameId))
    } finally {
      unmount()
    }
  })

  it('finalizar sobre un juego inexistente propaga notFound', async () => {
    const seasonId = toSeasonId('s1')
    const { result, unmount } = withColada(() => useGames(seasonId))

    try {
      await expect(
        result.finalizeGame.mutateAsync({ gameId: toGameId('missing'), by: 'user-1' }),
      ).rejects.toMatchObject({ code: 'notFound' })
    } finally {
      unmount()
    }
  })
})
