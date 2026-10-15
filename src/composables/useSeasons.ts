import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { seasonsRepository } from '@/data/seasons.repository'
import type { CreateSeasonInput, SeasonRecord } from '@/data/seasons.repository'
import type { SeasonId } from '@/domain/types'
import { gamesKeys } from '@/queries/games'
import { seasonsKeys, seasonsListQuery } from '@/queries/seasons'

/**
 * T66 · RF-11.1 a RF-11.7: consulta y mutaciones de temporadas. Crear invalida `['seasons']`;
 * cerrar invalida además `['games']` porque la pantalla de partidas puede agrupar por el estado
 * de la temporada (T66).
 */
export function useSeasons() {
  const query = useQuery(seasonsListQuery())
  const queryCache = useQueryCache()

  const createSeason = useMutation({
    mutation: (input: CreateSeasonInput): Promise<SeasonRecord> => seasonsRepository.create(input),
    onSettled: () => {
      void queryCache.invalidateQueries({ key: seasonsKeys.root })
    },
  })

  const closeSeason = useMutation({
    mutation: (seasonId: SeasonId): Promise<SeasonRecord> => seasonsRepository.close(seasonId),
    onSettled: () => {
      void queryCache.invalidateQueries({ key: seasonsKeys.root })
      void queryCache.invalidateQueries({ key: gamesKeys.root })
    },
  })

  return {
    state: query.state,
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
    refetch: query.refetch,
    createSeason,
    closeSeason,
  }
}
