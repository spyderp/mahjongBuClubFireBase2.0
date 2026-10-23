import type { ResultType } from './types'
import { FU_CHIITOITSU, FU_PINFU, isLimitYaku, sumYakuHan } from './yaku'
import type { YakuContext, YakuHanSum, YakuId } from './yaku'

/** Tramo en que cae la mano antes de aplicar la fórmula (RF-16.3, `docs/domain.md` §4.2). */
export type LimitBand = 'yakuman' | 'sanbaiman' | 'baiman' | 'haneman' | 'mangan' | 'formula'

export type HandResultType = Extract<ResultType, 'ron' | 'tsumo'>

export type HandValueInput = {
  readonly yaku: readonly YakuId[]
  readonly yakuHan: number
  readonly doraCount: number
  readonly fu: number
  /**
   * RF-31.1: si la mano es **cerrada**. `undefined` es un turno escrito antes de `specs/004`: se
   * supone cerrada, que es lo que el motor asumía en silencio hasta que la captura dijo otra cosa.
   */
  readonly isClosedHand?: boolean
  /**
   * RF-31.2: si la mano tuvo **kan**. `undefined` es un turno escrito antes de `specs/004`: se
   * supone sin kan, igual que antes.
   */
  readonly hasKan?: boolean
  /**
   * RF-32.1 y RF-32.3: el ajuste a mano de los han, como **delta** sobre la suma del catálogo de
   * este ganador (RF-22.9). Vive aparte del total a propósito, y no se convierte en un total
   * absoluto al pasar a ser por ganador.
   */
  readonly yakuHanOverride?: number
}

/**
 * Lo que el turno sabe de la mano y que **no** depende del ganador (RF-31.5).
 *
 * Lo que sí depende del ganador —si la mano está abierta y si tuvo kan— viaja dentro de la propia
 * mano, porque es de la mano. Lo que está aquí es de la **partida**: el resultado del turno, si
 * alguien declaró riichi, y si la mano es la primera o la última.
 */
export type HandSituation = {
  readonly resultType: ResultType
  readonly hasRiichiDeclared: boolean
  readonly isFirstHand: boolean
  readonly isFinalHand: boolean
}

export type HandValue = {
  readonly han: number
  readonly fu: number
  readonly basicPoints: number
  readonly band: LimitBand
}

export type PaymentContext = {
  readonly honba: number
  readonly winnerIsDealer: boolean
}

export type TsumoPayment =
  | { readonly winnerIsDealer: true; readonly eachPays: number; readonly total: number }
  | {
      readonly winnerIsDealer: false
      readonly nonDealerPays: number
      readonly dealerPays: number
      readonly total: number
    }

export type RepresentableRejection = 'pinfuOnlyByTsumo' | 'chiitoitsuTsumoWithoutMenzenTsumo'

export type RepresentableResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: RepresentableRejection }

const YAKUMAN_BASIC_POINTS = 8000
const MANGAN_BASIC_POINTS = 2000
const HAN_SANBAIMAN = 11
const HAN_BAIMAN = 8
const HAN_HANEMAN = 6
const HAN_MANGAN = 5
const FU_MANGAN_HAN4 = 40
const FU_MANGAN_HAN3 = 70
const CHIITOITSU_TSUMO_MIN_HAN = 3

const RON_MULTIPLIER_NON_DEALER = 4
const RON_MULTIPLIER_DEALER = 6
const TSUMO_MULTIPLIER_NON_DEALER = 1
const TSUMO_MULTIPLIER_DEALER = 2
const HONBA_RON = 300
const HONBA_PER_PAYER = 100

const BASIC_POINTS_BY_LIMIT: Record<Exclude<LimitBand, 'formula'>, number> = {
  yakuman: YAKUMAN_BASIC_POINTS,
  sanbaiman: 6000,
  baiman: 4000,
  haneman: 3000,
  mangan: MANGAN_BASIC_POINTS,
}

/**
 * Valor de la mano (RF-16.1). Los yaku de límite se detectan desde `yaku` y tienen
 * precedencia sobre `han`; el resto de manos pasa por los tramos de `docs/domain.md` §4.2
 * y solo en el último cae en la fórmula `fu × 2^(2 + totalHan)`.
 */
export function computeHandValue(input: HandValueInput): HandValue {
  const han = input.yakuHan + input.doraCount
  const band = limitBandOf(
    han,
    input.fu,
    input.yaku.some((id) => isLimitYaku(id)),
  )

  return { han, fu: input.fu, basicPoints: basicPointsOf(band, han, input.fu), band }
}

/**
 * RF-31.5: el contexto que decide qué yaku cuentan sale de **lo capturado en el turno**, no de
 * constantes del formulario.
 *
 * Una mano sin contexto —un turno escrito antes de `specs/004`— se supone cerrada y sin kan,
 * que es exactamente lo que el motor asumía antes de que existiera la captura. Por eso los dos
 * campos son opcionales y no obligatorios: hacerlos obligatorios obligaría a migrar y re-puntuar
 * las partidas ya escritas (RF-37.3).
 */
export function handContextOf(hand: HandValueInput, situation: HandSituation): YakuContext {
  return {
    resultType: situation.resultType,
    isClosedHand: hand.isClosedHand ?? true,
    hasRiichiDeclared: situation.hasRiichiDeclared,
    hasKan: hand.hasKan ?? false,
    isFirstHand: situation.isFirstHand,
    isFinalHand: situation.isFinalHand,
  }
}

/**
 * RF-31.3 y RF-31.4: la suma de han de yaku de una mano **con su contexto**, con el kan aplicado
 * en los dos sentidos: `ippatsu` exige la ausencia de kan, así que marcar kan **quita** yaku.
 *
 * El desglose sale del catálogo de `domain/yaku.ts` y no se reimplementa aquí: quien lo pinte lo
 * lee de `YakuHanSum.breakdown`, que ya dice qué yaku no contó y por qué (RF-22.3).
 */
export function sumHandYakuHan(hand: HandValueInput, situation: HandSituation): YakuHanSum {
  return sumYakuHan(hand.yaku, handContextOf(hand, situation))
}

/**
 * Si la mano trae el contexto que se capturó (RF-37.3).
 *
 * Un turno escrito antes de `specs/004` no lo trae, y esa es la única manera de distinguirlo de
 * uno nuevo: los campos nuevos son opcionales y no se migran los turnos antiguos.
 */
export function hasHandContext(hand: HandValueInput): boolean {
  return hand.isClosedHand !== undefined || hand.hasKan !== undefined
}

/**
 * El han de yaku que cuenta en el cálculo (RF-31.6).
 *
 * Una mano **con contexto** se vuelve a sumar con el contexto que se capturó: por eso corregir el
 * contexto de un ganador recalcula su desglose y el `yakuHan` guardado queda igual al que produce
 * el recálculo. El ajuste a mano sigue siendo un delta encima de esa suma (RF-22.9).
 *
 * Una mano **sin contexto** —un turno anterior a 004— usa el `yakuHan` que ya tenía guardado: los
 * turnos antiguos no se re-puntúan (RF-37.3) y `rulesetVersion` no cambia por ellos (RF-37.4).
 */
export function effectiveYakuHan(hand: HandValueInput, situation: HandSituation): number {
  if (!hasHandContext(hand)) {
    return hand.yakuHan
  }

  return sumHandYakuHan(hand, situation).han + (hand.yakuHanOverride ?? 0)
}

function limitBandOf(han: number, fu: number, hasLimitYaku: boolean): LimitBand {
  if (hasLimitYaku || han >= 13) {
    return 'yakuman'
  }

  if (han >= HAN_SANBAIMAN) {
    return 'sanbaiman'
  }

  if (han >= HAN_BAIMAN) {
    return 'baiman'
  }

  if (han >= HAN_HANEMAN) {
    return 'haneman'
  }

  if (
    han >= HAN_MANGAN ||
    (han === 4 && fu >= FU_MANGAN_HAN4) ||
    (han === 3 && fu >= FU_MANGAN_HAN3)
  ) {
    return 'mangan'
  }

  return 'formula'
}

function basicPointsOf(band: LimitBand, han: number, fu: number): number {
  return band === 'formula' ? fu * 2 ** (2 + han) : BASIC_POINTS_BY_LIMIT[band]
}

/**
 * Redondeo de cada pago hacia arriba a la centena, de forma independiente (RF-16.4).
 * El total nunca se redondea: por eso un tsumo cobra distinto al ron de la misma mano.
 */
export function roundUp(value: number): number {
  return Math.ceil(value / 100) * 100
}

export function ronPayment(hand: HandValue, context: PaymentContext): number {
  const multiplier = context.winnerIsDealer ? RON_MULTIPLIER_DEALER : RON_MULTIPLIER_NON_DEALER

  return roundUp(hand.basicPoints * multiplier) + HONBA_RON * context.honba
}

export function tsumoPayment(hand: HandValue, context: PaymentContext): TsumoPayment {
  const honbaShare = HONBA_PER_PAYER * context.honba

  if (context.winnerIsDealer) {
    const eachPays = roundUp(hand.basicPoints * TSUMO_MULTIPLIER_DEALER) + honbaShare

    return { winnerIsDealer: true, eachPays, total: eachPays * 3 }
  }

  const nonDealerPays = roundUp(hand.basicPoints * TSUMO_MULTIPLIER_NON_DEALER) + honbaShare
  const dealerPays = roundUp(hand.basicPoints * TSUMO_MULTIPLIER_DEALER) + honbaShare

  return {
    winnerIsDealer: false,
    nonDealerPays,
    dealerPays,
    total: nonDealerPays * 2 + dealerPays,
  }
}

/**
 * Combinaciones de han y fu no representables en la tabla (RF-4.4): un ron no puede tener 20 fu
 * porque el pinfu por ron son 30 —corrección del 2026-10-15 sobre un dato que las reglas no
 * tenían—, así que los 20 fu planos solo existen por pinfu y solo por tsumo. El tsumo de chiitoitsu
 * siempre lleva *menzen tsumo* y por eso puntúa 3 han o más.
 *
 * El motivo se llama `pinfuOnlyByTsumo` porque así lo nombra RF-4.4 de `specs/001`; lo que exige
 * es que un ron no baje de 30 fu, no que el pinfu no se pueda ganar por ron.
 */
export function validateRepresentable(input: {
  readonly han: number
  readonly fu: number
  readonly resultType: HandResultType
}): RepresentableResult {
  if (input.resultType === 'ron' && input.fu === FU_PINFU) {
    return { ok: false, reason: 'pinfuOnlyByTsumo' }
  }

  if (
    input.resultType === 'tsumo' &&
    input.fu === FU_CHIITOITSU &&
    input.han < CHIITOITSU_TSUMO_MIN_HAN
  ) {
    return { ok: false, reason: 'chiitoitsuTsumoWithoutMenzenTsumo' }
  }

  return { ok: true }
}
