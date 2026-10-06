import { canFinalize } from './rules'
import { uma } from './uma'
import type { PlayerDelta } from './turn'
import type { GameLength, GameStatus, PlayerId, Position, Seat, Timestamp } from './types'

/** Regla de los 7 días (RF-10.4): abandonar exige más de tantos días sin actividad. */
export const STALE_DAYS = 7

const DAY_IN_SECONDS = 86400
const SEAT_ORDER: Record<Seat, number> = { east: 0, south: 1, west: 2, north: 3 }

export type FinalizablePlayer = {
  readonly playerId: PlayerId
  readonly seat: Seat
  readonly score: number
  readonly chombo: boolean
  readonly bankrupt: boolean
}

export type PlayerFinalResult = FinalizablePlayer & {
  readonly position: Position
  readonly uma: number
  readonly finalScore: number
}

export type GameAction = 'capture' | 'finalize' | 'abandon'
export type TransitionRejection = 'notOpen' | 'mustFinalize' | 'idleDaysNotPassed'

export type GameTransitionInput = {
  readonly status: GameStatus
  readonly mustFinalize: boolean
  readonly turnCount: number
  readonly gameLength: GameLength
  readonly idleDays: number
}

export type GameTransition =
  | { readonly ok: true; readonly status: GameStatus }
  | { readonly ok: false; readonly reason: TransitionRejection }

/**
 * RF-8.1 y RF-8.3: ordena por marcador descendente y, a igualdad, por asiento de Este a Norte,
 * y asigna las posiciones 1.ª a 4.ª sin huecos (`docs/domain.md` §5). La puntuación final es
 * marcador + uma (RF-8.1).
 */
export function finalizeResults(
  players: readonly FinalizablePlayer[],
): readonly PlayerFinalResult[] {
  return [...players].sort(byFinalRank).map((player, index) => {
    const position = positionAt(index)
    const positionBonus = uma(position)

    return {
      ...player,
      position,
      uma: positionBonus,
      finalScore: player.score + positionBonus,
    }
  })
}

/** Marcador acumulado (RF-3.x, RF-8.1): punto inicial más la suma de los deltas de sus turnos. */
export function playerScore(
  playerId: PlayerId,
  startPoints: number,
  turns: readonly (readonly PlayerDelta[])[],
): number {
  let score = startPoints

  for (const turn of turns) {
    for (const entry of turn) {
      if (entry.playerId === playerId) {
        score += entry.delta
      }
    }
  }

  return score
}

/**
 * RF-0.1 a RF-0.4 y RF-9.2: ciclo de vida de la partida. Solo `open` acepta transiciones; con
 * `mustFinalize` la única salida es finalizar; finalizar sin el mínimo de turnos aborta; abandonar
 * solo es posible pasados 7 días sin actividad.
 */
export function transition(action: GameAction, input: GameTransitionInput): GameTransition {
  if (input.status !== 'open') {
    return { ok: false, reason: 'notOpen' }
  }

  if (action === 'capture') {
    return input.mustFinalize ? { ok: false, reason: 'mustFinalize' } : { ok: true, status: 'open' }
  }

  if (action === 'finalize') {
    return input.mustFinalize || canFinalize(input.turnCount, input.gameLength)
      ? { ok: true, status: 'finalized' }
      : { ok: true, status: 'aborted' }
  }

  if (input.mustFinalize) {
    return { ok: false, reason: 'mustFinalize' }
  }

  return input.idleDays <= STALE_DAYS
    ? { ok: false, reason: 'idleDaysNotPassed' }
    : { ok: true, status: 'unfinished' }
}

/** RF-0.3: solo la partida finalizada conserva resultados que computan en el ranking. */
export function computes(status: GameStatus): boolean {
  return status === 'finalized'
}

/**
 * RF-10.4 y RF-10.5: días naturales completos sin actividad. Se compara por número de día
 * (segundos truncados a días) para que el umbral corte a medianoche UTC, sin depender de horas.
 */
export function daysSinceActivity(updatedAt: Timestamp, now: Timestamp): number {
  return dayNumber(now) - dayNumber(updatedAt)
}

/** El abandono se ofrece pasados los 7 días completos (RF-10.4): el día 7 no basta. */
export function offersAbandon(updatedAt: Timestamp, now: Timestamp): boolean {
  return daysSinceActivity(updatedAt, now) > STALE_DAYS
}

function byFinalRank(a: FinalizablePlayer, b: FinalizablePlayer): number {
  if (a.score !== b.score) {
    return b.score - a.score
  }

  return SEAT_ORDER[a.seat] - SEAT_ORDER[b.seat]
}

function positionAt(index: number): Position {
  switch (index) {
    case 0:
      return '1st'
    case 1:
      return '2nd'
    case 2:
      return '3rd'
    default:
      return '4th'
  }
}

function dayNumber(timestamp: Timestamp): number {
  return Math.floor(timestamp.seconds / DAY_IN_SECONDS)
}
