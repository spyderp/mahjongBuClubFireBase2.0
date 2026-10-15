import { defineQueryOptions } from '@pinia/colada'
import { gamesRepository } from '@/data/games.repository'
import type { GameId, SeasonId } from '@/domain/types'

const gamesRoot = ['games'] as const

/** RF-2.1 a RF-2.9 y RF-9.1 a RF-9.6: claves de partidas. */
export const gamesKeys = {
  root: gamesRoot,
  bySeason: (seasonId: SeasonId) => [...gamesRoot, 'season', seasonId] as const,
  listOpen: [...gamesRoot, 'open'] as const,
  detail: (gameId: GameId) => [...gamesRoot, 'detail', gameId] as const,
}

/**
 * RF-2.1 a RF-2.9: partidas de una temporada, ordenadas por fecha descendente. Con `seasonId`
 * `null` la consulta queda `enabled: false`: la temporada se elige en la vista (RF-13.7).
 */
export const gamesBySeasonQuery = defineQueryOptions((seasonId: SeasonId | null) => ({
  key: seasonId === null ? gamesKeys.root : gamesKeys.bySeason(seasonId),
  enabled: seasonId !== null,
  query: async () => (seasonId === null ? [] : gamesRepository.listBySeason(seasonId)),
  meta: { errorMessage: 'errors.load.games' },
}))

/** RF-10.4 y RF-10.5: partidas abiertas, de la más recientemente tocada a la más vieja. */
export const gamesListOpenQuery = defineQueryOptions(() => ({
  key: gamesKeys.listOpen,
  query: () => gamesRepository.listOpen(),
  meta: { errorMessage: 'errors.load.games' },
}))

/** Partida por ID para la pantalla de detalle. */
export const gameDetailQuery = defineQueryOptions((gameId: GameId) => ({
  key: gamesKeys.detail(gameId),
  query: () => gamesRepository.getById(gameId),
  meta: { errorMessage: 'errors.load.games' },
}))
