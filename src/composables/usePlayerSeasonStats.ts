import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import type { SeasonId } from '@/domain/types'
import { playerSeasonStatsQuery } from '@/queries/playerSeasonStats'

/**
 * T69 · RF-12.5: estadísticas por jugador de una temporada (solo lectura). Con `seasonId`
 * `null` la consulta queda `enabled: false` (RF-13.7). No depende de `useRankings`: los
 * nombres se resuelven desde la caché compartida por quien componga la vista.
 */
export function usePlayerSeasonStats(seasonId: MaybeRefOrGetter<SeasonId | null>) {
  const season = computed(() => toValue(seasonId))
  const query = useQuery(() => playerSeasonStatsQuery(season.value))

  return {
    state: query.state,
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
    refetch: query.refetch,
  }
}
