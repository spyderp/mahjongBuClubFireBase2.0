import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatch } from '@/data/batch'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import type { PlayerSeasonStats } from '@/domain/stats'
import { toPlayerId, toSeasonId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

function stat(playerId: string, seasonId: string, actualPoints: number): PlayerSeasonStats {
  return {
    playerId: toPlayerId(playerId),
    seasonId: toSeasonId(seasonId),
    actualPoints,
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
}

describe('T64 · playerSeasonStats.repository', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('listBySeason devuelve vacío sin documentos', async () => {
    expect(await playerSeasonStatsRepository.listBySeason(toSeasonId('s1'))).toHaveLength(0)
  })

  it('replaceForSeason escribe los documentos del batch que recibe y no confirma', async () => {
    const batch = createBatch()
    await playerSeasonStatsRepository.replaceForSeason(
      toSeasonId('s1'),
      [stat('p1', 's1', 25000)],
      batch,
    )

    expect(await playerSeasonStatsRepository.listBySeason(toSeasonId('s1'))).toHaveLength(0)

    await batch.commit()

    expect(await playerSeasonStatsRepository.listBySeason(toSeasonId('s1'))).toHaveLength(1)
  })

  it('replaceForSeason sobrescribe la temporada completa en una segunda pasada', async () => {
    const first = createBatch()
    await playerSeasonStatsRepository.replaceForSeason(
      toSeasonId('s1'),
      [stat('p1', 's1', 25000)],
      first,
    )
    await first.commit()

    const second = createBatch()
    await playerSeasonStatsRepository.replaceForSeason(
      toSeasonId('s1'),
      [stat('p1', 's1', 30000)],
      second,
    )
    await second.commit()

    const season = await playerSeasonStatsRepository.listBySeason(toSeasonId('s1'))

    expect(season).toHaveLength(1)
    expect(season[0]?.actualPoints).toBe(30000)
  })

  it('replaceForSeason de una temporada no toca los documentos de otra', async () => {
    const une = createBatch()
    await playerSeasonStatsRepository.replaceForSeason(
      toSeasonId('s2'),
      [stat('p2', 's2', 1000)],
      une,
    )
    await une.commit()

    const batch = createBatch()
    await playerSeasonStatsRepository.replaceForSeason(
      toSeasonId('s1'),
      [stat('p1', 's1', 25000)],
      batch,
    )
    await batch.commit()

    const other = await playerSeasonStatsRepository.listBySeason(toSeasonId('s2'))

    expect(other).toHaveLength(1)
    expect(other[0]?.playerId).toBe(toPlayerId('p2'))
    expect(other[0]?.seasonId).toBe(toSeasonId('s2'))
    expect(other[0]?.actualPoints).toBe(1000)
  })
})
