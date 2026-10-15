import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatch } from '@/data/batch'
import { rankingsRepository } from '@/data/rankings.repository'
import type { RankingEntry } from '@/data/rankings.repository'
import { toPlayerId, toSeasonId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

function entry(playerId: string, points: number, rank: number): RankingEntry {
  return {
    playerId: toPlayerId(playerId),
    playerName: `Jugador ${playerId}`,
    points,
    victories: 1,
    seconds: 0,
    gamesPlayed: 1,
    rank,
  }
}

describe('T64 · rankings.repository', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('listBySeason devuelve vacío sin documentos', async () => {
    expect(await rankingsRepository.listBySeason(toSeasonId('s1'))).toHaveLength(0)
  })

  it('replaceForSeason escribe los documentos del batch que recibe y no confirma', async () => {
    const batch = createBatch()
    await rankingsRepository.replaceForSeason(toSeasonId('s1'), [entry('p1', 25000, 1)], batch)

    expect(await rankingsRepository.listBySeason(toSeasonId('s1'))).toHaveLength(0)

    await batch.commit()

    const season = await rankingsRepository.listBySeason(toSeasonId('s1'))

    expect(season).toHaveLength(1)
    expect(season[0]).toMatchObject({
      playerId: toPlayerId('p1'),
      seasonId: toSeasonId('s1'),
      points: 25000,
      gamesPlayed: 1,
      rank: 1,
    })
  })

  it('listBySeason ordena por rank', async () => {
    const batch = createBatch()
    await rankingsRepository.replaceForSeason(
      toSeasonId('s1'),
      [entry('p1', 15000, 2), entry('p2', 25000, 1)],
      batch,
    )
    await batch.commit()

    const season = await rankingsRepository.listBySeason(toSeasonId('s1'))

    expect(season.map((record) => record.rank)).toEqual([1, 2])
  })

  it('replaceForSeason retira las entradas que ya no están en la temporada', async () => {
    const first = createBatch()
    await rankingsRepository.replaceForSeason(
      toSeasonId('s1'),
      [entry('p1', 25000, 1), entry('p2', 15000, 2)],
      first,
    )
    await first.commit()

    const second = createBatch()
    await rankingsRepository.replaceForSeason(toSeasonId('s1'), [entry('p1', 30000, 1)], second)
    await second.commit()

    const season = await rankingsRepository.listBySeason(toSeasonId('s1'))

    expect(season).toHaveLength(1)
    expect(season[0]?.points).toBe(30000)
  })

  it('replaceForSeason de una temporada no toca los documentos de otra', async () => {
    const other = createBatch()
    await rankingsRepository.replaceForSeason(toSeasonId('s2'), [entry('p2', 1000, 1)], other)
    await other.commit()

    const batch = createBatch()
    await rankingsRepository.replaceForSeason(toSeasonId('s1'), [entry('p1', 25000, 1)], batch)
    await batch.commit()

    const season = await rankingsRepository.listBySeason(toSeasonId('s2'))

    expect(season).toHaveLength(1)
    expect(season[0]?.playerId).toBe(toPlayerId('p2'))
  })
})
