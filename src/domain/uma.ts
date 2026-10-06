import type { Position } from './types'

/**
 * Uma por posición (RF-8.6, `docs/domain.md` §4.1): 30, +10, −10 y −30. No hay rama de ajuste:
 * la posición es la única clave, constante para toda partida.
 */
const UMA_BY_POSITION: Record<Position, number> = { '1st': 30, '2nd': 10, '3rd': -10, '4th': -30 }

/**
 * Bonus de posición en puntos (RF-8.4 y RF-8.6). El punto de retorno de 30 000 vive en
 * `domain/rules.ts` (`RETURN_POINT`), no se duplica aquí.
 */
export function uma(position: Position): number {
  return UMA_BY_POSITION[position]
}
