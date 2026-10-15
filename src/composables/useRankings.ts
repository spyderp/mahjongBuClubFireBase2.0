import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import type { SeasonId } from '@/domain/types'
import { rankingsQuery } from '@/queries/rankings'

/**
 * T69 · RF-13.5 a RF-13.7: tabla de la temporada (solo lectura). Con `seasonId` `null` la
 * consulta queda `enabled: false` (RF-13.7). No depende de `usePlayerSeasonStats`: los nombres
 * y desempates se resuelven desde la caché compartida por quien componga la vista.
 */
export function useRankings(seasonId: MaybeRefOrGetter<SeasonId | null>) {
  const season = computed(() => toValue(seasonId))
  const query = useQuery(() => rankingsQuery(season.value))

  return {
    state: query.state,
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
    refetch: query.refetch,
  }
}
