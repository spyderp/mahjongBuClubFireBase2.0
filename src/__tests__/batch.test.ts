import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc } from 'firebase/firestore'
import type { WriteBatch } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { createBatch } from '@/data/batch'
import { gamesRepository } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import { rankingsRepository } from '@/data/rankings.repository'
import type { RankingEntry } from '@/data/rankings.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { turnsRepository } from '@/data/turns.repository'
import type { CreateTurnInput } from '@/data/turns.repository'
import { toGameId, toPlayerId, toSeasonId } from '@/domain/types'
import type { GameId, Seat } from '@/domain/types'
import type { PlayerSeasonStats } from '@/domain/stats'
import { fakeGetDb, fakeReset } from '@/test-utils/fakeFirestore'

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

function turnInput(turnNo: number): CreateTurnInput {
  return {
    turnNo,
    wind: 'east',
    dealerId: toPlayerId('p1'),
    honba: 0,
    resultType: 'ryuukyoku',
    yaku: [],
    yakuHan: 0,
    doraCount: 0,
    fu: 0,
    tenpai: [],
    riichiDeclaredBy: [],
    riichiSticks: 0,
    value: [],
    deltas: [],
    capturedBy: 'user-1',
    isRenchan: false,
    isFinalTurn: false,
    discarderId: null,
    chomboId: null,
    yakuHanOverride: 0,
  }
}

async function gameSeed(): Promise<GameId> {
  const game = await gamesRepository.create({
    seasonId: null,
    date: atDay(1),
    gameLength: 'tonpuusen',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: 25000,
    players: PLAYERS,
  })

  return game.id
}

function paths(prefix: string): string[] {
  return [...fakeGetDb().docs.keys()].filter(
    (path) => path === prefix || path.startsWith(`${prefix}/`),
  )
}

function count(prefix: string): number {
  return paths(prefix).length
}

async function field(path: string, fieldName: string): Promise<unknown> {
  const segments = path.split('/')
  const first = segments[0]

  if (first === undefined) {
    throw new Error(`ruta inválida: ${path}`)
  }

  const document = doc(getDb(), first, ...segments.slice(1))
  const snapshot = await getDoc(document)
  const data = snapshot.data() as unknown as Record<string, unknown> | undefined

  return data?.[fieldName]
}

type SweepCase = {
  name: string
  seed: () => Promise<void>
  writeNoBatch: () => Promise<void>
  writeInBatch: (batch: WriteBatch) => Promise<void>
  beforeCommit: () => boolean | Promise<boolean>
  afterCommit: () => boolean | Promise<boolean>
}

let p1 = toPlayerId('__pending__')
let s1 = toSeasonId('__pending__')
let g1 = toGameId('__pending__')

const SWEEP: SweepCase[] = [
  {
    name: 'players.create',
    seed: async () => {
      await playersRepository.create({ externalId: 'mb-000', name: 'Original' })
    },
    writeNoBatch: async () => {
      await playersRepository.create({ externalId: 'mb-001', name: 'Nuevo' })
    },
    writeInBatch: async (batch) => {
      await playersRepository.create({ externalId: 'mb-001', name: 'Nuevo' }, batch)
    },
    beforeCommit: () => count('players') === 1,
    afterCommit: () => count('players') === 2,
  },
  {
    name: 'players.update',
    seed: async () => {
      p1 = (await playersRepository.create({ externalId: 'mb-000', name: 'Original' })).id
    },
    writeNoBatch: async () => {
      await playersRepository.update(p1, { name: 'Cambiado' })
    },
    writeInBatch: async (batch) => {
      await playersRepository.update(p1, { name: 'Cambiado' }, batch)
    },
    beforeCommit: async () => (await field(`players/${p1}`, 'name')) === 'Original',
    afterCommit: async () => (await field(`players/${p1}`, 'name')) === 'Cambiado',
  },
  {
    name: 'players.remove',
    seed: async () => {
      p1 = (await playersRepository.create({ externalId: 'mb-000', name: 'Original' })).id
    },
    writeNoBatch: async () => {
      await playersRepository.remove(p1)
    },
    writeInBatch: async (batch) => {
      await playersRepository.remove(p1, batch)
    },
    beforeCommit: () => count('players') === 1,
    afterCommit: () => count('players') === 0,
  },
  {
    name: 'seasons.create',
    seed: async () => {
      await seasonsRepository.create({ title: 'Previa', dateFrom: atDay(1), dateTo: atDay(10) })
    },
    writeNoBatch: async () => {
      await seasonsRepository.create({ title: 'Nueva', dateFrom: atDay(20), dateTo: atDay(30) })
    },
    writeInBatch: async (batch) => {
      await seasonsRepository.create(
        { title: 'Nueva', dateFrom: atDay(20), dateTo: atDay(30) },
        batch,
      )
    },
    beforeCommit: () => count('seasons') === 1,
    afterCommit: () => count('seasons') === 2,
  },
  {
    name: 'seasons.update',
    seed: async () => {
      s1 = (
        await seasonsRepository.create({ title: 'Previa', dateFrom: atDay(1), dateTo: atDay(10) })
      ).id
    },
    writeNoBatch: async () => {
      await seasonsRepository.update(s1, { title: 'Renombrada' })
    },
    writeInBatch: async (batch) => {
      await seasonsRepository.update(s1, { title: 'Renombrada' }, batch)
    },
    beforeCommit: async () => (await field(`seasons/${s1}`, 'title')) === 'Previa',
    afterCommit: async () => (await field(`seasons/${s1}`, 'title')) === 'Renombrada',
  },
  {
    name: 'seasons.close',
    seed: async () => {
      s1 = (
        await seasonsRepository.create({ title: 'Previa', dateFrom: atDay(1), dateTo: atDay(10) })
      ).id
    },
    writeNoBatch: async () => {
      await seasonsRepository.close(s1)
    },
    writeInBatch: async (batch) => {
      await seasonsRepository.close(s1, batch)
    },
    beforeCommit: async () => (await field(`seasons/${s1}`, 'status')) === 'open',
    afterCommit: async () => (await field(`seasons/${s1}`, 'status')) === 'closed',
  },
  {
    name: 'games.create',
    seed: async () => {
      await gameSeed()
    },
    writeNoBatch: async () => {
      await gameSeed()
    },
    writeInBatch: async (batch) => {
      await gamesRepository.create(
        {
          seasonId: null,
          date: atDay(1),
          gameLength: 'tonpuusen',
          ruleset: 'mahjongSouls',
          rulesetVersion: '1.0',
          startPoints: 25000,
          players: PLAYERS,
        },
        batch,
      )
    },
    beforeCommit: () => count('games') === 1,
    afterCommit: () => count('games') === 2,
  },
  {
    name: 'games.update',
    seed: async () => {
      g1 = await gameSeed()
    },
    writeNoBatch: async () => {
      await gamesRepository.update(g1, { startPoints: 30000 })
    },
    writeInBatch: async (batch) => {
      await gamesRepository.update(g1, { startPoints: 30000 }, batch)
    },
    beforeCommit: async () => (await field(`games/${g1}`, 'startPoints')) === 25000,
    afterCommit: async () => (await field(`games/${g1}`, 'startPoints')) === 30000,
  },
  {
    name: 'games.remove',
    seed: async () => {
      g1 = await gameSeed()
    },
    writeNoBatch: async () => {
      await gamesRepository.remove(g1)
    },
    writeInBatch: async (batch) => {
      await gamesRepository.remove(g1, batch)
    },
    beforeCommit: () => count('games') === 1,
    afterCommit: () => count('games') === 0,
  },
  {
    name: 'turns.create',
    seed: async () => {
      g1 = await gameSeed()
    },
    writeNoBatch: async () => {
      await turnsRepository.create(g1, turnInput(1))
    },
    writeInBatch: async (batch) => {
      await turnsRepository.create(g1, turnInput(1), batch)
    },
    beforeCommit: () => count(`games/${g1}/turns`) === 0,
    afterCommit: () => count(`games/${g1}/turns`) === 1,
  },
  {
    name: 'turns.update',
    seed: async () => {
      g1 = await gameSeed()
      await turnsRepository.create(g1, turnInput(1))
    },
    writeNoBatch: async () => {
      await turnsRepository.update(g1, 1, { honba: 2 }, { by: 'user-2', expectedAuditCount: 0 })
    },
    writeInBatch: async (batch) => {
      await turnsRepository.update(
        g1,
        1,
        { honba: 2 },
        { batch, by: 'user-2', expectedAuditCount: 0 },
      )
    },
    beforeCommit: async () => (await field(`games/${g1}/turns/1`, 'honba')) === 0,
    afterCommit: async () => (await field(`games/${g1}/turns/1`, 'honba')) === 2,
  },
  {
    name: 'turns.remove',
    seed: async () => {
      g1 = await gameSeed()
      await turnsRepository.create(g1, turnInput(1))
      await turnsRepository.create(g1, turnInput(2))
    },
    writeNoBatch: async () => {
      await turnsRepository.remove(g1, 2)
    },
    writeInBatch: async (batch) => {
      await turnsRepository.remove(g1, 2, batch)
    },
    beforeCommit: () => count(`games/${g1}/turns`) === 2,
    afterCommit: () => count(`games/${g1}/turns`) === 1,
  },
]

const SWEEP_ROWS = SWEEP.map((c) => [c.name, c] as const)

describe('T59 · escrituras con batch propio', () => {
  beforeEach(() => {
    fakeReset()
  })

  it.each(SWEEP_ROWS)('persiste %s sin batch ajeno', async (_name, sweep) => {
    await sweep.seed()
    await sweep.writeNoBatch()

    expect(await sweep.afterCommit()).toBe(true)
  })
})

describe('T59 · escrituras con batch ajeno', () => {
  beforeEach(() => {
    fakeReset()
  })

  it.each(SWEEP_ROWS)('no persiste %s hasta el commit', async (_name, sweep) => {
    await sweep.seed()

    const batch = createBatch()
    await sweep.writeInBatch(batch)

    expect(await sweep.beforeCommit()).toBe(true)

    await batch.commit()

    expect(await sweep.afterCommit()).toBe(true)
  })
})

describe('T59 · RF-9.5 una mutación, un WriteBatch', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('un turno y los derivados viajan en el mismo batch y se confirman juntos', async () => {
    const player = await playersRepository.create({ externalId: 'mb-000', name: 'Ana' })
    const season = await seasonsRepository.create({
      title: 'Temporada 1',
      dateFrom: atDay(1),
      dateTo: atDay(30),
    })
    const game = await gamesRepository.create({
      seasonId: season.id,
      date: atDay(5),
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: PLAYERS,
    })

    const stat: PlayerSeasonStats = {
      playerId: player.id,
      seasonId: season.id,
      actualPoints: 25000,
      gamesPlayed: 1,
      victories: 1,
      positions: { '1st': 1, '2nd': 0, '3rd': 0, '4th': 0 },
      yakuStats: {
        riichi: 0,
        dora: 0,
        kan: 0,
        tsumo: 0,
        ron: 0,
        chombo: 0,
        haiteiRaoyue: 0,
        rinshanKaihou: 0,
        yakuman: 0,
      },
    }
    const entry: RankingEntry = {
      playerId: player.id,
      playerName: 'Ana',
      points: 25000,
      victories: 1,
      seconds: 0,
      gamesPlayed: 1,
      rank: 1,
    }

    const batch = createBatch()
    await turnsRepository.create(game.id, turnInput(1), batch)
    await playerSeasonStatsRepository.replaceForSeason(season.id, [stat], batch)
    await rankingsRepository.replaceForSeason(season.id, [entry], batch)

    expect(paths(`games/${game.id}/turns`)).toHaveLength(0)
    expect(await playerSeasonStatsRepository.listBySeason(season.id)).toHaveLength(0)
    expect(await rankingsRepository.listBySeason(season.id)).toHaveLength(0)

    await batch.commit()

    expect(paths(`games/${game.id}/turns`)).toHaveLength(1)
    expect(await playerSeasonStatsRepository.listBySeason(season.id)).toHaveLength(1)
    expect(await rankingsRepository.listBySeason(season.id)).toHaveLength(1)
  })
})
