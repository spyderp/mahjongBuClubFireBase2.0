import { computeHandValue, ronPayment, tsumoPayment } from './handValue'
import type { HandValue, HandValueInput } from './handValue'
import type { PlayerId, Seat } from './types'

const SEAT_ORDER: Record<Seat, number> = { east: 0, south: 1, west: 2, north: 3 }
const RIICHI_STICK_VALUE = 1000
const CHOMBO_PENALTY = 8000
const EXACT_DRAW_TOTAL = 3000
const EXTENSION_PER_PAIR = 1000
const MAX_RON_WINNERS = 3

export type PlayerDelta = {
  readonly playerId: PlayerId
  readonly delta: number
}

export type TurnPlayer = {
  readonly playerId: PlayerId
  readonly seat: Seat
  readonly score: number
}

export type TurnWinnerInput = {
  readonly playerId: PlayerId
  readonly hand: HandValueInput
}

export type TurnBase = {
  readonly players: readonly TurnPlayer[]
  /**
   * RF-18.1: el dealer de este turno. **No** es quien ocupa el asiento Este: la localía avanza
   * con la partida y el motor tiene que saber quién la ocupa en cada turno. Antes se deducía del
   * asiento, lo que hacía que a partir del segundo turno los pagos se calcularan contra el
   * dealer equivocado sin que nada lo detectara.
   */
  readonly dealerId: PlayerId
  readonly honba: number
  readonly riichiDeclaredBy: readonly PlayerId[]
  readonly riichiSticksBefore: number
}

export type TurnInput =
  | (TurnBase & { readonly resultType: 'tsumo'; readonly winners: readonly TurnWinnerInput[] })
  | (TurnBase & {
      readonly resultType: 'ron'
      readonly winners: readonly TurnWinnerInput[]
      readonly discarderId: PlayerId
    })
  | (TurnBase & {
      readonly resultType: 'ryuukyoku'
      readonly tenpai: readonly PlayerId[]
      readonly isExtension?: boolean
    })
  | (TurnBase & { readonly resultType: 'chombo'; readonly chomboId: PlayerId })

export type TurnValue = {
  readonly playerId: PlayerId
  readonly han: number
  readonly fu: number
  readonly basicPoints: number
  readonly points: number
  readonly deltas: readonly PlayerDelta[]
}

export type TurnResolution = {
  readonly values: readonly TurnValue[]
  readonly deltas: readonly PlayerDelta[]
  readonly riichiSticks: number
  readonly bankrupt: boolean
  readonly bankruptPlayerId: PlayerId | null
  readonly bankruptBalance: number | null
}

export type TurnRejection = 'moreThanThreeWinners'

export type TurnResult =
  | { readonly ok: true; readonly resolution: TurnResolution }
  | { readonly ok: false; readonly reason: TurnRejection }

export type SquareCheckInput = {
  readonly deltas: readonly PlayerDelta[]
  readonly riichiDeclared: number
  /**
   * Fichas **reclamadas en este turno**, incluida la que se declara en él: si el bote se
   * adjudica, es `riichiSticksBefore + riichiDeclaredBy.length`; si no, 0. Pasar solo el bote
   * previo da un fallo falso: la ficha recién declarada sí sale de la mesa y vuelve al ganador.
   */
  readonly riichiSticksClaimedThisTurn: number
  readonly chombos: number
}

export type SquareCheckResult =
  { readonly ok: true } | { readonly ok: false; readonly expected: number; readonly actual: number }

type DrawTurnInput = Extract<TurnInput, { readonly resultType: 'ryuukyoku' }>

type Win = {
  readonly playerId: PlayerId
  readonly seat: Seat
  readonly hand: HandValue
  readonly points: number
  readonly dealerShare: number
  readonly nonDealerShare: number
}

/**
 * Resuelve un turno completo (RF-3.3, RF-5, RF-6, RF-7): calcula los deltas de los cuatro
 * jugadores, el valor por ganador, las fichas de riichi que quedan en el bote y si el turno
 * deja a alguien por debajo de cero. Los puntos nunca se teclean: salen del motor de la mano.
 */
export function resolveTurn(input: TurnInput): TurnResult {
  if (input.resultType === 'ron' && input.winners.length > MAX_RON_WINNERS) {
    return { ok: false, reason: 'moreThanThreeWinners' }
  }

  const players = [...input.players].sort(bySeat)
  const wins = winsOf(input, players, input.honba)
  const claimed = wins.length > 0
  const sticksOnTable = input.riichiSticksBefore + input.riichiDeclaredBy.length
  const pot = claimed ? sticksOnTable * RIICHI_STICK_VALUE : 0
  const riichiSticks = claimed ? 0 : sticksOnTable
  const potWinnerId = wins.length > 0 ? potWinnerOf(wins) : null
  const values = wins.map((winning) => toValue(winning, input, players, potWinnerId, pot))

  const deltas: PlayerDelta[] = []
  let bankruptPlayerId: PlayerId | null = null
  let bankruptBalance: number | null = null

  for (const player of players) {
    const riichiCost =
      -RIICHI_STICK_VALUE * input.riichiDeclaredBy.filter((id) => id === player.playerId).length
    const delta = earnedBy(player, values) + riichiCost + extraDelta(player, input)

    if (delta !== 0) {
      deltas.push({ playerId: player.playerId, delta })
    }

    if (bankruptBalance === null && player.score + delta < 0) {
      bankruptPlayerId = player.playerId
      bankruptBalance = player.score + delta
    }
  }

  return {
    ok: true,
    resolution: {
      values,
      deltas,
      riichiSticks,
      bankrupt: bankruptPlayerId !== null,
      bankruptPlayerId,
      bankruptBalance,
    },
  }
}

/**
 * Invariante de cuadre (RF-4.1): la suma de los deltas de un turno no es cero porque las fichas
 * de riichi declaradas salen del marcador sin entrar en nadie y los 8000 del chombo se destruyen.
 * El bote que se reclama sí es neutro, y por eso se resta de lo declarado: cuenta las fichas
 * **de este turno**, incluida la que se declara en él, no solo las que ya había en la mesa.
 */
export function checkSquare(input: SquareCheckInput): SquareCheckResult {
  const actual = input.deltas.reduce((total, entry) => total + entry.delta, 0)
  const expected =
    -RIICHI_STICK_VALUE * (input.riichiDeclared - input.riichiSticksClaimedThisTurn) -
    CHOMBO_PENALTY * input.chombos

  return actual === expected ? { ok: true } : { ok: false, expected, actual }
}

function bySeat(a: TurnPlayer, b: TurnPlayer): number {
  return SEAT_ORDER[a.seat] - SEAT_ORDER[b.seat]
}

function winsOf(input: TurnInput, players: readonly TurnPlayer[], honba: number): readonly Win[] {
  if (input.resultType !== 'tsumo' && input.resultType !== 'ron') {
    return []
  }

  const wins: Win[] = []

  for (const player of players) {
    const winner = input.winners.find((candidate) => candidate.playerId === player.playerId)

    if (winner !== undefined) {
      wins.push(toWin(player, winner.hand, honba, input.resultType, input.dealerId))
    }
  }

  return wins
}

function toWin(
  player: TurnPlayer,
  handInput: HandValueInput,
  honba: number,
  resultType: 'tsumo' | 'ron',
  dealerId: PlayerId,
): Win {
  const hand = computeHandValue(handInput)
  const winnerIsDealer = player.playerId === dealerId
  const base = { playerId: player.playerId, seat: player.seat, hand }

  if (resultType === 'ron') {
    return {
      ...base,
      points: ronPayment(hand, { honba, winnerIsDealer }),
      dealerShare: 0,
      nonDealerShare: 0,
    }
  }

  const payment = tsumoPayment(hand, { honba, winnerIsDealer })

  return payment.winnerIsDealer
    ? {
        ...base,
        points: payment.total,
        dealerShare: payment.eachPays,
        nonDealerShare: payment.eachPays,
      }
    : {
        ...base,
        points: payment.total,
        dealerShare: payment.dealerPays,
        nonDealerShare: payment.nonDealerPays,
      }
}

/**
 * El bote se lo lleva la mano de mayor puntos básicos; a igual valor, el de menor asiento
 * (RF-5.4). Solo hay bote que adjudicar cuando el turno termina en tsumo o ron.
 */
function potWinnerOf(wins: readonly Win[]): PlayerId {
  return wins.reduce((best, candidate) => (claimsPot(candidate, best) ? candidate : best)).playerId
}

function claimsPot(candidate: Win, best: Win): boolean {
  if (candidate.hand.basicPoints !== best.hand.basicPoints) {
    return candidate.hand.basicPoints > best.hand.basicPoints
  }

  return SEAT_ORDER[candidate.seat] < SEAT_ORDER[best.seat]
}

function toValue(
  winning: Win,
  input: TurnInput,
  players: readonly TurnPlayer[],
  potWinnerId: PlayerId | null,
  pot: number,
): TurnValue {
  const share = potWinnerId === winning.playerId ? pot : 0
  const deltas: PlayerDelta[] = []

  for (const player of players) {
    const delta = deltaFromWin(winning, player, input, share)

    if (delta !== 0) {
      deltas.push({ playerId: player.playerId, delta })
    }
  }

  return {
    playerId: winning.playerId,
    han: winning.hand.han,
    fu: winning.hand.fu,
    basicPoints: winning.hand.basicPoints,
    points: winning.points,
    deltas,
  }
}

/** Movimiento causado por una mano ganadora concreta sobre un jugador concreto. */
function deltaFromWin(winning: Win, player: TurnPlayer, input: TurnInput, pot: number): number {
  if (winning.playerId === player.playerId) {
    return winning.points + pot
  }

  if (input.resultType === 'ron') {
    return player.playerId === input.discarderId ? -winning.points : 0
  }

  return -(player.playerId === input.dealerId ? winning.dealerShare : winning.nonDealerShare)
}

/** Penalizaciones o reparto de tenpai que no nacen de ninguna mano ganadora. */
function extraDelta(player: TurnPlayer, input: TurnInput): number {
  if (input.resultType === 'ryuukyoku') {
    return drawDelta(player, input)
  }

  if (input.resultType === 'chombo') {
    return player.playerId === input.chomboId ? -CHOMBO_PENALTY : 0
  }

  return 0
}

/**
 * Empate normal (RF-5.5): 3000 puntos en total salen de los sin tenpai y se reparten a
 * partes iguales entre los tenpai. Prórroga: cada pareja no tenpai × tenpai desplaza 1000.
 */
function drawDelta(player: TurnPlayer, input: DrawTurnInput): number {
  const receivers = input.players.filter((candidate) =>
    input.tenpai.includes(candidate.playerId),
  ).length
  const payers = input.players.length - receivers

  if (payers === 0 || receivers === 0) {
    return 0
  }

  const isTenpai = input.tenpai.includes(player.playerId)

  if (input.isExtension === true) {
    return isTenpai ? EXTENSION_PER_PAIR * payers : -EXTENSION_PER_PAIR * receivers
  }

  return isTenpai ? EXACT_DRAW_TOTAL / receivers : -EXACT_DRAW_TOTAL / payers
}

/** Suma de los movimientos que este jugador recibe de todas las manos ganadoras. */
function earnedBy(player: TurnPlayer, values: readonly TurnValue[]): number {
  let total = 0

  for (const value of values) {
    for (const entry of value.deltas) {
      if (entry.playerId === player.playerId) {
        total += entry.delta
      }
    }
  }

  return total
}
