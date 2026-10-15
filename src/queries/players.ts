import { defineQueryOptions } from '@pinia/colada'
import { playersRepository } from '@/data/players.repository'

/**
 * RF-1.1 a RF-1.7: clave raíz de jugadores. Los nombres de la caché se resuelven leyendo
 * esta misma clave compartida (AGENT.md → Contrato de queries y composables).
 */
export const playersKeys = {
  root: ['players'] as const,
}

/** RF-1.1: listado completo de jugadores, ordenado por nombre (`playersRepository.list`). */
export const playersListQuery = defineQueryOptions(() => ({
  key: playersKeys.root,
  query: () => playersRepository.list(),
  meta: { errorMessage: 'errors.load.players' },
}))
