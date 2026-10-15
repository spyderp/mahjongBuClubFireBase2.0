import { defineQueryOptions } from '@pinia/colada'
import { rankingsRepository } from '@/data/rankings.repository'
import type { SeasonId } from '@/domain/types'

/** RF-13.1 a RF-13.7: clave de los documentos derivados por temporada. */
export const rankingsKeys = {
  root: ['rankings'] as const,
  bySeason: (seasonId: SeasonId) => [...rankingsKeys.root, seasonId] as const,
}

/**
 * RF-13.5: tabla de la temporada (solo lectura). Con `seasonId` `null` la consulta queda
 * `enabled: false`: la temporada se elige en la vista (RF-13.7).
 */
export const rankingsQuery = defineQueryOptions((seasonId: SeasonId | null) => ({
  key: seasonId === null ? rankingsKeys.root : rankingsKeys.bySeason(seasonId),
  enabled: seasonId !== null,
  query: async () => (seasonId === null ? [] : rankingsRepository.listBySeason(seasonId)),
  meta: { errorMessage: 'errors.load.rankings' },
}))
