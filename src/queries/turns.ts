import { defineQueryOptions } from '@pinia/colada'
import { turnsRepository } from '@/data/turns.repository'
import type { GameId } from '@/domain/types'

/** RF-3.1 a RF-3.8 y RF-4.x: clave de los turnos de una partida. */
export const turnsKeys = {
  list: (gameId: GameId) => ['turns', gameId] as const,
}

/** RF-3.1 a RF-3.8: turnos de una partida, en orden correlativo. */
export const turnsListQuery = defineQueryOptions((gameId: GameId) => ({
  key: turnsKeys.list(gameId),
  query: () => turnsRepository.list(gameId),
  meta: { errorMessage: 'errors.load.turns' },
}))
