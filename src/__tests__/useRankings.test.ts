import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useRankings } from '@/composables/useRankings'
import { rankingsRepository } from '@/data/rankings.repository'
import { createBatch } from '@/data/batch'
import type { RankingEntry } from '@/data/rankings.repository'
import { toPlayerId, toSeasonId } from '@/domain/types'
import type { SeasonId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { withColada } from '@/test-utils/colada'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

async function seedRanking(seasonId: SeasonId): Promise<void> {
  const entries: readonly RankingEntry[] = [
    {
      playerId: toPlayerId('p1'),
      playerName: 'Ana',
      points: 37030,
      victories: 1,
      seconds: 0,
      gamesPlayed: 1,
      rank: 1,
    },
    {
      playerId: toPlayerId('p2'),
      playerName: 'Bob',
      points: 20970,
      victories: 0,
      seconds: 0,
      gamesPlayed: 1,
      rank: 2,
    },
  ]
  const batch = createBatch()
  await rankingsRepository.replaceForSeason(seasonId, entries, batch)
  await batch.commit()
}

describe('T69 · useRankings', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('sin seasonId queda enabled: false y con seasonId carga la tabla', async () => {
    const season = ref<SeasonId | null>(null)
    const { result, unmount } = withColada(() => useRankings(season))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('pending'))
      expect(result.data.value).toBeUndefined()

      await seedRanking(toSeasonId('s1'))
      season.value = toSeasonId('s1')

      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value).toHaveLength(2)
      expect(result.data.value?.map((entry) => entry.rank)).toEqual([1, 2])
    } finally {
      unmount()
    }
  })

  it('solo lectura: expone la forma base y no muta documentos derivados', async () => {
    const seasonId = toSeasonId('s1')
    await seedRanking(seasonId)

    const { result, unmount } = withColada(() => useRankings(seasonId))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value?.[0]?.playerId).toBe(toPlayerId('p1'))
      expect(result.data.value?.[0]?.points).toBe(37030)
      expect(typeof result.refresh).toBe('function')
      expect(result.error.value).toBeNull()
    } finally {
      unmount()
    }
  })
})
