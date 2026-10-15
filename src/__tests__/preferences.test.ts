import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePreferencesStore } from '@/stores/preferences'
import { toSeasonId } from '@/domain/types'

const STORAGE_KEY = 'mahjongbu.preferences'

describe('T71 · stores/preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('arranca con los valores por defecto cuando no hay nada persistido', () => {
    const store = usePreferencesStore()

    expect(store.theme).toBe('dark')
    expect(store.density).toBe('compact')
    expect(store.lastSeasonId).toBeNull()
  })

  it('setDensity persiste y un store nuevo lo recupera', async () => {
    const first = usePreferencesStore()

    first.setDensity('comfortable')
    await nextTick()

    expect(localStorage.getItem(STORAGE_KEY)).toContain('"density":"comfortable"')

    setActivePinia(createPinia())
    const second = usePreferencesStore()

    expect(second.density).toBe('comfortable')
  })

  it('setLastSeason persiste la última temporada vista (RF-13.7)', async () => {
    const first = usePreferencesStore()

    first.setLastSeason(toSeasonId('s1'))
    await nextTick()

    expect(localStorage.getItem(STORAGE_KEY)).toContain('"lastSeasonId":"s1"')

    setActivePinia(createPinia())
    const second = usePreferencesStore()

    expect(second.lastSeasonId).toBe(toSeasonId('s1'))
  })

  it('un JSON corrupto no rompe la hidratación: usa los valores por defecto', () => {
    localStorage.setItem(STORAGE_KEY, '{no-es-json')

    const store = usePreferencesStore()

    expect(store.theme).toBe('dark')
    expect(store.density).toBe('compact')
    expect(store.lastSeasonId).toBeNull()
  })

  it('valores inválidos del storage caen al defecto por campo', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: 'light', density: 'enorme', lastSeasonId: 42 }),
    )

    const store = usePreferencesStore()

    expect(store.density).toBe('compact')
    expect(store.lastSeasonId).toBeNull()
  })

  it('persistir falla sin romper el estado en memoria (RNF-3)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const store = usePreferencesStore()

    store.setDensity('comfortable')
    await nextTick()

    expect(store.density).toBe('comfortable')

    spy.mockRestore()
  })
})
