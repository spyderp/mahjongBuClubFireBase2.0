import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { toSeasonId } from '@/domain/types'
import type { SeasonId } from '@/domain/types'

export type TableDensity = 'compact' | 'comfortable'

export type StoredPreferences = {
  readonly theme: 'dark'
  readonly density: TableDensity
  readonly lastSeasonId: SeasonId | null
}

const STORAGE_KEY = 'mahjongbu.preferences'
const DEFAULT_PREFERENCES: StoredPreferences = Object.freeze({
  theme: 'dark',
  density: 'compact',
  lastSeasonId: null,
})

/**
 * T71 · RF-13.7: preferencias de la aplicación cacheadas en `localStorage` (tema, densidad de
 * tabla y última temporada vista). El store no consume `useQuery()` (AGENT.md → Stores) y la
 * persitencia es un fallo no fatal: si el almacenamiento no está disponible, el estado sigue
 * vivo en memoria.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const stored = readPreferences()
  const theme = ref<'dark'>('dark')
  const density = ref<TableDensity>(stored.density)
  const lastSeasonId = ref<SeasonId | null>(stored.lastSeasonId)

  function persist(): void {
    persistPreferences({
      theme: theme.value,
      density: density.value,
      lastSeasonId: lastSeasonId.value,
    })
  }

  watch([density, lastSeasonId], persist)

  function setDensity(next: TableDensity): void {
    density.value = next
  }

  function setLastSeason(next: SeasonId | null): void {
    lastSeasonId.value = next
  }

  return { theme, density, lastSeasonId, setDensity, setLastSeason, persist }
})

/** Borde de almacenamiento: lee y valida; ante cualquier ruina, devuelve los valores por defecto. */
export function readPreferences(): StoredPreferences {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (raw === null) {
    return { ...DEFAULT_PREFERENCES }
  }

  try {
    return parsePreferences(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

/** Borde de almacenamiento: persiste y reporta si la escritura pudo completarse. */
export function persistPreferences(preferences: StoredPreferences): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))

    return true
  } catch {
    return false
  }
}

function parsePreferences(parsed: unknown): StoredPreferences {
  if (!isRecord(parsed)) {
    return { ...DEFAULT_PREFERENCES }
  }

  const density = parsed['density'] === 'comfortable' ? 'comfortable' : 'compact'
  const rawSeason = parsed['lastSeasonId']
  const lastSeasonId =
    typeof rawSeason === 'string' && rawSeason.length > 0 ? toSeasonId(rawSeason) : null

  return { theme: 'dark', density, lastSeasonId }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
