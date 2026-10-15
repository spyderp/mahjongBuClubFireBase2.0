import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@pinia/colada'
import { useSeasons } from '@/composables/useSeasons'
import { seasonsRepository } from '@/data/seasons.repository'
import { fakeReset } from '@/test-utils/fakeFirestore'
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

async function seedSeason(title: string, from: number, to: number) {
  return seasonsRepository.create({ title, dateFrom: atDay(from), dateTo: atDay(to) })
}

describe('T66 · useSeasons', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('lista las temporadas ordenadas por dateFrom', async () => {
    await seedSeason('Intermedia', 10, 40)
    await seedSeason('Primera', 1, 9)

    const { result, unmount } = withColada(() => useSeasons())

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value?.map((season) => season.title)).toEqual(['Primera', 'Intermedia'])
    } finally {
      unmount()
    }
  })

  it('createSeason crea e invalida ["seasons"]: la lista se refresca', async () => {
    const { result, unmount } = withColada(() => useSeasons())

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value).toHaveLength(0)

      const created = await result.createSeason.mutateAsync({
        title: 'Primera',
        dateFrom: atDay(1),
        dateTo: atDay(9),
      })

      expect(created.status).toBe('open')
      await vi.waitFor(() => expect(result.data.value?.some((s) => s.id === created.id)).toBe(true))
    } finally {
      unmount()
    }
  })

  it('closeSeason cierra e invalida ["seasons"] y ["games"]', async () => {
    const season = await seedSeason('Primera', 1, 9)
    const gamesSpy = vi.fn(() => Promise.resolve([{ id: 'g1' }]))

    const { result, unmount } = withColada(() => {
      const seasons = useSeasons()
      const games = useQuery({ key: ['games', 'season', season.id], query: gamesSpy })

      return { seasons, games }
    })

    try {
      await vi.waitFor(() => expect(result.seasons.state.value.status).toBe('success'))
      await vi.waitFor(() => expect(gamesSpy).toHaveBeenCalledTimes(1))

      const closed = await result.seasons.closeSeason.mutateAsync(season.id)

      expect(closed.status).toBe('closed')
      await vi.waitFor(() => expect(gamesSpy).toHaveBeenCalledTimes(2))
      await vi.waitFor(() =>
        expect(result.seasons.data.value?.find((s) => s.id === season.id)?.status).toBe('closed'),
      )
    } finally {
      unmount()
    }
  })
})
