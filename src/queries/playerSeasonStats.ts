import { defineQueryOptions } from '@pinia/colada'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import type { SeasonId } from '@/domain/types'

/** RF-12.1 a RF-12.8: clave de los documentos derivados por temporada. */
export const playerSeasonStatsKeys = {
  root: ['season-stats'] as const,
  bySeason: (seasonId: SeasonId) => [...playerSeasonStatsKeys.root, seasonId] as const,
}

/**
 * RF-12.5: estadísticas por jugador de una temporada (solo lectura). Con `seasonId` `null` la
 * consulta queda `enabled: false`: la temporada se elige en la vista (RF-13.7).
 */
export const playerSeasonStatsQuery = defineQueryOptions((seasonId: SeasonId | null) => ({
  key: seasonId === null ? playerSeasonStatsKeys.root : playerSeasonStatsKeys.bySeason(seasonId),
  enabled: seasonId !== null,
  query: async () => (seasonId === null ? [] : playerSeasonStatsRepository.listBySeason(seasonId)),
  meta: { errorMessage: 'errors.load.playerSeasonStats' },
}))
