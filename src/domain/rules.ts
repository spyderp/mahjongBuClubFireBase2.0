import type { GameLength, Seat } from './types'

/** Punto de retorno (RF-8.5, `docs/domain.md` §4.1): alcanzarlo cierra la necesidad de prórroga. */
export const RETURN_POINT = 30000

export type HandState = {
  readonly wind: Seat
  readonly dealer: Seat
  readonly honba: number
}

export type HandOutcome =
  | { readonly type: 'dealerWin' }
  | { readonly type: 'otherWin' }
  | { readonly type: 'dealerTenpaiDraw' }
  | { readonly type: 'otherDraw' }
  | { readonly type: 'chombo' }

/**
 * Mínimo de turnos por modo (RF-2.6): el Este completo en tonpuusen y Este + Sur en hanchan.
 * Es un piso de finalización, no una longitud esperada (`docs/domain.md` §2).
 */
export function minTurns(gameLength: GameLength): number {
  return gameLength === 'tonpuusen' ? 4 : 8
}

/**
 * RF-9.1 y RF-9.2: por debajo del mínimo la partida no puede finalizarse; si se intenta,
 * entra en `abortada` (decisión que toma el ciclo de vida de `game.ts`).
 */
export function canFinalize(turnCount: number, gameLength: GameLength): boolean {
  return turnCount >= minTurns(gameLength)
}

/**
 * Renchan: la mano se repite porque el dealer ganó o hizo draw dejándose en tenpai
 * (`docs/domain.md` §1).
 */
export function isRenchan(outcome: HandOutcome): boolean {
  return outcome.type === 'dealerWin' || outcome.type === 'dealerTenpaiDraw'
}

/**
 * Siguiente mano (RF-3.13): la localía avanza por asiento cuando no hay renchan, el viento
 * avanza al volver la localía al Este, y el honba **sube con la localía y vuelve a cero al perderla**
 * (RF-18.3, RF-18.5 y desviación 8 de `docs/domain.md` §4.5).
 *
 * El chombo es el tercer caso: conserva la localía pero **no** sube el contador, porque la mano no se
 * jugó (RF-7.6 de `specs/001/spec.md`). Por eso tiene su propio tipo de resultado y no cabe ni en la
 * rama del renchan ni en la del giro de localía.
 */
export function nextHand(state: HandState, outcome: HandOutcome): HandState {
  if (outcome.type === 'chombo') {
    return state
  }

  const renchan = isRenchan(outcome)
  const honba = renchan ? state.honba + 1 : 0

  if (renchan) {
    return { ...state, honba }
  }

  const dealer = nextSeat(state.dealer)
  const wind = dealer === 'east' ? nextSeat(state.wind) : state.wind

  return { wind, dealer, honba }
}

/**
 * RF-18.2: la partida arranca en la ronda del Este, con el Este de localía y honba 0. El primer
 * dealer es quien ocupa el asiento Este, que es la única forma de que el estado inicial no dependa
 * del orden en que se listaron los jugadores.
 */
export function initialHandState(): HandState {
  return { wind: 'east', dealer: 'east', honba: 0 }
}

/**
 * Prórroga (_sudden death_): solo se añade una mano extra si al cerrar la última ronda
 * prevista el líder no ha alcanzado el punto de retorno (RF-9.1, `docs/domain.md` §2).
 */
export function needsExtension(leaderScore: number): boolean {
  return leaderScore < RETURN_POINT
}

function nextSeat(seat: Seat): Seat {
  switch (seat) {
    case 'east':
      return 'south'
    case 'south':
      return 'west'
    case 'west':
      return 'north'
    case 'north':
      return 'east'
  }
}
