import { defineQueryOptions } from '@pinia/colada'
import { seasonsRepository } from '@/data/seasons.repository'

/** RF-11.1 a RF-11.7: clave raíz de temporadas. */
export const seasonsKeys = {
  root: ['seasons'] as const,
}

/** RF-11.1: listado de temporadas ordenado por `dateFrom` ascendente. */
export const seasonsListQuery = defineQueryOptions(() => ({
  key: seasonsKeys.root,
  query: () => seasonsRepository.list(),
  meta: { errorMessage: 'errors.load.seasons' },
}))
