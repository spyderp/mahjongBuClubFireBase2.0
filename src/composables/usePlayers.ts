import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { playersRepository } from '@/data/players.repository'
import type { CreatePlayerInput, PlayerRecord, UpdatePlayerInput } from '@/data/players.repository'
import type { PlayerId } from '@/domain/types'
import { playersKeys, playersListQuery } from '@/queries/players'

/**
 * T65 · RF-1.1 a RF-1.7: consulta y mutaciones de jugadores. Las escrituras devuelven el
 * registro creado o actualizado, nunca `void`, e invalidan la clave raíz al terminar para que
 * la lista (y los nombres que cualquier panel resuelve desde la caché) se refresque.
 */
export function usePlayers() {
  const query = useQuery(playersListQuery())
  const queryCache = useQueryCache()

  const createPlayer = useMutation({
    mutation: (input: CreatePlayerInput): Promise<PlayerRecord> => playersRepository.create(input),
    onSettled: () => {
      void queryCache.invalidateQueries({ key: playersKeys.root })
    },
  })

  const updatePlayer = useMutation({
    mutation: (vars: {
      readonly id: PlayerId
      readonly patch: UpdatePlayerInput
    }): Promise<PlayerRecord> => playersRepository.update(vars.id, vars.patch),
    onSettled: () => {
      void queryCache.invalidateQueries({ key: playersKeys.root })
    },
  })

  const removePlayer = useMutation({
    mutation: (id: PlayerId): Promise<void> => playersRepository.remove(id),
    onSettled: () => {
      void queryCache.invalidateQueries({ key: playersKeys.root })
    },
  })

  return {
    state: query.state,
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
    refetch: query.refetch,
    createPlayer,
    updatePlayer,
    removePlayer,
  }
}
