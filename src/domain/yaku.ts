import type { Seat, Wind } from './types'

/**
 * `normal` puntúa con la fórmula de `handValue.ts`. `limit` puntúa 8000 puntos
 * básicos según `docs/domain.md` §4.2 y tiene precedencia sobre la fórmula (RF-16.3).
 */
export type YakuCategory = 'normal' | 'limit'

/** Subconjunto de `yakuStats` de RF-12.4 que se rellena desde el catálogo. */
export type YakuStatKey = 'riichi' | 'tsumo' | 'haiteiRaoyue' | 'rinshanKaihou'

export type NormalYakuId =
  | 'riichi'
  | 'ippatsu'
  | 'menzenTsumo'
  | 'pinfu'
  | 'tanyao'
  | 'iipeiko'
  | 'haku'
  | 'hatsu'
  | 'chun'
  | 'rinshanKaihou'
  | 'chankan'
  | 'haiteiRaoyue'
  | 'houteiRaoyui'
  | 'chiitoitsu'
  | 'sanshokuDoukou'
  | 'toitoi'
  | 'sanankou'
  | 'sankantsu'
  | 'shousangen'
  | 'honroutou'
  | 'junchan'
  | 'ryanpeikou'
  | 'honitsu'
  | 'nagashiMangan'
  | 'chinitsu'
  | WindYakuId

/**
 * Los trece yaku de límite de `docs/domain.md` §4.2. Su `han` es el valor tradicional
 * de referencia y NO se suma nunca: la puntuación sale de `category === 'limit'`.
 * Ver la nota de `YAKU_CATALOG`.
 */
export type LimitYakuId =
  | 'kokushiMusou'
  | 'suukantsu'
  | 'daisangen'
  | 'shousuushii'
  | 'daisuushii'
  | 'tsuuiisou'
  | 'chinroutou'
  | 'ryuuiisou'
  | 'chuurenPoutou'
  | 'suuchaRiichi'
  | 'sanchuurenhou'
  | 'tenhou'
  | 'chiihou'

export type YakuId = NormalYakuId | LimitYakuId

/** Yaku cuyo valor depende de un viento: del asiento del jugador o del viento de ronda. */
export type WindYakuId =
  | 'seatEast'
  | 'seatSouth'
  | 'seatWest'
  | 'seatNorth'
  | 'roundEast'
  | 'roundSouth'
  | 'roundWest'
  | 'roundNorth'

export interface YakuDefinition {
  readonly id: YakuId
  readonly category: YakuCategory
  /**
   * Han del yaku. Para `category: 'limit'` es el valor tradicional de referencia y
   * no se suma: los yaku de límite valen 8000 puntos, no `han` × 100.
   */
  readonly han: number
  /** `true` cuando el yaku depende de la estructura de la mano y no se reconoce abierta. */
  readonly requiresClosedHand: boolean
  readonly statKey: YakuStatKey | null
}

/** Valor tradicional de un yakuman de 13 han. */
const YAKUMAN_REFERENCE_HAN = 13

function normal(
  id: NormalYakuId,
  han: number,
  options: { readonly closed?: boolean; readonly statKey?: YakuStatKey } = {},
): YakuDefinition {
  return {
    id,
    category: 'normal',
    han,
    requiresClosedHand: options.closed ?? false,
    statKey: options.statKey ?? null,
  }
}

function limit(id: LimitYakuId, han: number = YAKUMAN_REFERENCE_HAN): YakuDefinition {
  return {
    id,
    category: 'limit',
    han,
    requiresClosedHand: false,
    statKey: null,
  }
}

/** Base de cualquier mano, antes de bonificaciones. */
export const FU_BASE = 20
export const FU_CHIITOITSU = 25
export const FU_MENZEN_RON = 10
export const FU_TSUMO = 2
export const FU_CLOSED_TRIANGLE = 2
export const FU_CONCEALED_KAN = 2

/**
 * Los yaku de viento son 1 han cada uno. Los dragones no dependen de ningún viento,
 * así que `validateWindYaku` los ignora y siempre son válidos.
 */
const WIND_YAKU_IDS = [
  'seatEast',
  'seatSouth',
  'seatWest',
  'seatNorth',
  'roundEast',
  'roundSouth',
  'roundWest',
  'roundNorth',
] as const satisfies readonly WindYakuId[]

/**
 * Los trece yaku de límite, en el orden en que los nombra `docs/domain.md` §4.2.
 *
 * Todos valen 8000 puntos básicos: no hay doble ni triple yakuman (desviación 4 de
 * `docs/domain.md` §4.5). El `han` que llevan es el valor tradicional de referencia y
 * **no se suma nunca**. Sumarlo puntuaría un daisangen como 6 han y volvería a
 * introducir el doble yakuman que la desviación 4 elimina.
 */
export const LIMIT_YAKU: readonly YakuDefinition[] = [
  limit('kokushiMusou'),
  limit('suukantsu'),
  limit('daisangen', 6),
  limit('shousuushii'),
  limit('daisuushii'),
  limit('tsuuiisou'),
  limit('chinroutou'),
  limit('ryuuiisou'),
  limit('chuurenPoutou'),
  limit('suuchaRiichi'),
  limit('sanchuurenhou'),
  limit('tenhou'),
  limit('chiihou'),
]

export const YAKU_CATALOG: readonly YakuDefinition[] = [
  normal('riichi', 1, { statKey: 'riichi' }),
  normal('ippatsu', 1),
  normal('menzenTsumo', 1, { statKey: 'tsumo' }),
  normal('pinfu', 1),
  normal('tanyao', 1),
  normal('iipeiko', 1, { closed: true }),
  normal('haku', 1),
  normal('hatsu', 1),
  normal('chun', 1),
  normal('rinshanKaihou', 1, { statKey: 'rinshanKaihou' }),
  normal('chankan', 1),
  normal('haiteiRaoyue', 1, { statKey: 'haiteiRaoyue' }),
  normal('houteiRaoyui', 1),
  normal('chiitoitsu', 2),
  normal('sanshokuDoukou', 2, { closed: true }),
  normal('toitoi', 2),
  normal('sanankou', 2),
  normal('sankantsu', 2, { closed: true }),
  normal('shousangen', 2, { closed: true }),
  normal('honroutou', 2, { closed: true }),
  normal('junchan', 3, { closed: true }),
  normal('ryanpeikou', 3, { closed: true }),
  normal('honitsu', 3),
  normal('nagashiMangan', 5),
  normal('chinitsu', 6, { closed: true }),
  ...WIND_YAKU_IDS.map((id) => normal(id, 1)),
  ...LIMIT_YAKU,
]

export function findYaku(id: YakuId): YakuDefinition | undefined {
  return YAKU_CATALOG.find((definition) => definition.id === id)
}

export function isLimitYaku(id: YakuId): boolean {
  return findYaku(id)?.category === 'limit'
}

export function isWindYaku(id: YakuId): id is WindYakuId {
  return WIND_YAKU_IDS.some((windYakuId) => windYakuId === id)
}

export interface FuInput {
  readonly hasChiitoitsu: boolean
  readonly hasPinfu: boolean
  readonly isTsumo: boolean
  readonly isMenzenRon: boolean
  readonly concealedKanCount: number
  readonly closedTriangleCount: number
}

/** Pinfu son 20 fu planos, como chiitoitsu. */
export const FU_PINFU = 20

/**
 * Fu de una mano según la tabla de `docs/domain.md` §4.2. *Chiitoitsu* (25) y *pinfu* (20)
 * son valores planos y no admiten bonificaciones. El resto parte de 20 y suma cada
 * bonificación.
 */
export function computeFu(input: FuInput): number {
  if (input.hasChiitoitsu) {
    return FU_CHIITOITSU
  }

  if (input.hasPinfu) {
    return FU_PINFU
  }

  return (
    FU_BASE +
    (input.isMenzenRon ? FU_MENZEN_RON : 0) +
    (input.isTsumo ? FU_TSUMO : 0) +
    input.closedTriangleCount * FU_CLOSED_TRIANGLE +
    input.concealedKanCount * FU_CONCEALED_KAN
  )
}

export type WindYakuRejection = 'windNotOwned'

export type WindYakuResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: WindYakuRejection; readonly yaku: WindYakuId }

export interface WindYakuContext {
  /** Viento del asiento que ocupa el jugador. */
  readonly seat: Seat
  /** Viento de la ronda en curso. */
  readonly roundWind: Wind
}

/**
 * Un yaku de viento solo es válido si es el viento del asiento del jugador o el viento
 * de la ronda (RF-4.5). Devuelve el primer yaku inválido para que la interfaz pueda
 * señalar cuál es, en lugar de un rechazo genérico.
 */
export function validateWindYaku(
  declared: readonly YakuId[],
  context: WindYakuContext,
): WindYakuResult {
  for (const id of declared) {
    if (!isWindYaku(id)) {
      continue
    }

    if (!isOwnedWind(id, context)) {
      return { ok: false, reason: 'windNotOwned', yaku: id }
    }
  }

  return { ok: true }
}

function isOwnedWind(id: WindYakuId, context: WindYakuContext): boolean {
  const wind = windOf(id)

  return wind === context.seat || wind === context.roundWind
}

/**
 * El `switch` es exhaustivo a propósito: si se añade un `WindYakuId` y se olvida esta
 * función, el compilador falla en vez de dejar que un viento inválido pase la validación.
 */
function windOf(id: WindYakuId): Wind {
  switch (id) {
    case 'seatEast':
    case 'roundEast':
      return 'east'
    case 'seatSouth':
    case 'roundSouth':
      return 'south'
    case 'seatWest':
    case 'roundWest':
      return 'west'
    case 'seatNorth':
    case 'roundNorth':
      return 'north'
  }
}

export type ChiitoitsuFuRejection = 'fuWithoutChiitoitsu' | 'fuWithChiitoitsu'

export type ChiitoitsuFuResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: ChiitoitsuFuRejection }

/**
 * 25 fu solo es válido para *chiitoitsu*, y *chiitoitsu* solo vale 25 fu (RF-4.6, RF-16.6).
 */
export function validateChiitoitsuFu(fu: number, hasChiitoitsu: boolean): ChiitoitsuFuResult {
  if (fu === FU_CHIITOITSU) {
    return hasChiitoitsu ? { ok: true } : { ok: false, reason: 'fuWithoutChiitoitsu' }
  }

  return hasChiitoitsu ? { ok: false, reason: 'fuWithChiitoitsu' } : { ok: true }
}

export type YakuPresenceRejection = 'noYaku'

export type YakuPresenceResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: YakuPresenceRejection }

/**
 * Los dora suman han pero no sustituyen a un yaku real (RF-4.3, `docs/domain.md` §4.2).
 * Por eso `doraCount` no participa en la decisión y no aparece en el motivo del rechazo.
 */
export function validateYakuPresence(input: {
  readonly yakuHan: number
  readonly doraCount: number
}): YakuPresenceResult {
  if (input.yakuHan <= 0) {
    return { ok: false, reason: 'noYaku' }
  }

  return { ok: true }
}
