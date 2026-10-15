import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { usePlayerSeasonStats } from '@/composables/usePlayerSeasonStats'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import { createBatch } from '@/data/batch'
import type { PlayerSeasonStats } from '@/domain/stats'
import { toPlayerId, toSeasonId } from '@/domain/types'
import type { SeasonId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { withColada } from '@/test-utils/colada'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

function emptyYakuStats() {
  return {
    riichi: 0,
    dora: 0,
    kan: 0,
    tsumo: 0,
    ron: 0,
    chombo: 0,
    haiteiRaoyue: 0,
    rinshanKaihou: 0,
    yakuman: 0,
  }
}

async function seedStats(seasonId: SeasonId): Promise<void> {
  const stats: readonly PlayerSeasonStats[] = [
    {
      playerId: toPlayerId('p1'),
      seasonId,
      actualPoints: 37030,
      gamesPlayed: 1,
      victories: 1,
      positions: { '1st': 1, '2nd': 0, '3rd': 0, '4th': 0 },
      yakuStats: emptyYakuStats(),
    },
    {
      playerId: toPlayerId('p2'),
      seasonId,
      actualPoints: 20970,
      gamesPlayed: 1,
      victories: 0,
      positions: { '1st': 0, '2nd': 0, '3rd': 0, '4th': 1 },
      yakuStats: emptyYakuStats(),
    },
  ]
  const batch = createBatch()
  await playerSeasonStatsRepository.replaceForSeason(seasonId, stats, batch)
  await batch.commit()
}

describe('T69 · usePlayerSeasonStats', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('sin seasonId queda enabled: false y con seasonId carga los derivados', async () => {
    const season = ref<SeasonId | null>(null)
    const { result, unmount } = withColada(() => usePlayerSeasonStats(season))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('pending'))
      expect(result.data.value).toBeUndefined()

      await seedStats(toSeasonId('s1'))
      season.value = toSeasonId('s1')

      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value).toHaveLength(2)
      expect(result.data.value?.map((entry) => entry.playerId)).toEqual([
        toPlayerId('p1'),
        toPlayerId('p2'),
      ])
    } finally {
      unmount()
    }
  })

  it('lee de la caché compartida sin depender de useRankings: expone la forma base', async () => {
    const seasonId = toSeasonId('s1')
    await seedStats(seasonId)

    const { result, unmount } = withColada(() => usePlayerSeasonStats(seasonId))

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value?.[0]?.playerId).toBe(toPlayerId('p1'))
      expect(result.data.value?.[0]?.actualPoints).toBe(37030)
      expect(typeof result.refresh).toBe('function')
      expect(typeof result.refetch).toBe('function')
    } finally {
      unmount()
    }
  })
})
