import type { ResultType, Seat, Wind } from './types'

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

/**
 * Condición que un yaku exige para contar, tal y como las nombra RF-22.2: el resultado de la mano,
 * si está cerrada o abierta, el riichi declarado, la existencia de un kan, y ser la primera o la
 * última mano de la partida.
 *
 * Cada tipo es un predicado sin valor: `noKan` es lo contrario de `hasKan` y no un `hasKan` con
 * `false` puesto, porque un yaku que **no** cuenta con kan necesita exactamente la misma certeza
 * que uno que sí. La lista vacía significa que el yaku no depende del contexto.
 */
export type YakuCondition =
  | { readonly kind: 'resultType'; readonly accepts: readonly ResultType[] }
  | { readonly kind: 'closedHand' }
  | { readonly kind: 'riichiDeclared' }
  | { readonly kind: 'hasKan' }
  | { readonly kind: 'noKan' }
  | { readonly kind: 'firstHand' }
  | { readonly kind: 'finalHand' }

/** Lo que la mesa sabe de la mano en la que se está decidiendo qué yaku cuentan. */
export type YakuContext = {
  readonly resultType: ResultType
  readonly isClosedHand: boolean
  readonly hasRiichiDeclared: boolean
  readonly hasKan: boolean
  readonly isFirstHand: boolean
  readonly isFinalHand: boolean
}

export interface YakuDefinition {
  readonly id: YakuId
  readonly category: YakuCategory
  /**
   * Han del yaku. Para `category: 'limit'` es el valor tradicional de referencia y
   * no se suma: los yaku de límite valen 8000 puntos, no `han` × 100.
   */
  readonly han: number
  /**
   * `true` cuando el yaku depende de la estructura de la mano y no se reconoce abierta. Se
   * **deriva** de `conditions` y no se declara aparte: los dos campos dicen lo mismo, y mantenerlos
   * por separado es la forma de que acaben discrepando en silencio.
   */
  readonly requiresClosedHand: boolean
  readonly statKey: YakuStatKey | null
  /** Condiciones en las que el yaku cuenta. Vacía cuando no depende del contexto (RF-22.2). */
  readonly conditions: readonly YakuCondition[]
}

/** Valor tradicional de un yakuman de 13 han. */
const YAKUMAN_REFERENCE_HAN = 13

function normal(
  id: NormalYakuId,
  han: number,
  options: { readonly statKey?: YakuStatKey; readonly conditions?: readonly YakuCondition[] } = {},
): YakuDefinition {
  return definitionOf(id, 'normal', han, options.statKey ?? null, options.conditions ?? [])
}

function limit(
  id: LimitYakuId,
  conditions: readonly YakuCondition[],
  han: number = YAKUMAN_REFERENCE_HAN,
): YakuDefinition {
  return definitionOf(id, 'limit', han, null, conditions)
}

function definitionOf(
  id: YakuId,
  category: YakuCategory,
  han: number,
  statKey: YakuStatKey | null,
  conditions: readonly YakuCondition[],
): YakuDefinition {
  return {
    id,
    category,
    han,
    requiresClosedHand: conditions.some((condition) => condition.kind === 'closedHand'),
    statKey,
    conditions,
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
 * Átomos de condición del catálogo. Son constantes y no funciones porque un mismo yaku los
 * comparte con otros y así el catálogo se lee como la regla que es, no como una llamada.
 */
const CLOSED_HAND: YakuCondition = { kind: 'closedHand' }
const RIICHI_DECLARED: YakuCondition = { kind: 'riichiDeclared' }
const HAS_KAN: YakuCondition = { kind: 'hasKan' }
const NO_KAN: YakuCondition = { kind: 'noKan' }
const FIRST_HAND: YakuCondition = { kind: 'firstHand' }
const FINAL_HAND: YakuCondition = { kind: 'finalHand' }
const TSUMO: YakuCondition = { kind: 'resultType', accepts: ['tsumo'] }
const RON: YakuCondition = { kind: 'resultType', accepts: ['ron'] }
const RYUUKYOKU: YakuCondition = { kind: 'resultType', accepts: ['ryuukyoku'] }

/**
 * Los trece yaku de límite, en el orden en que los nombra `docs/domain.md` §4.2.
 *
 * Todos valen 8000 puntos básicos: no hay doble ni triple yakuman (desviación 4 de
 * `docs/domain.md` §4.5). El `han` que llevan es el valor tradicional de referencia y
 * **no se suma nunca**. Sumarlo puntuaría un daisangen como 6 han y volvería a
 * introducir el doble yakuman que la desviación 4 elimina.
 *
 * Declaran sus condiciones igual que los yaku normales (RF-22.2) aunque la suma no las mire: la
 * interfaz necesita poder decir *por qué* un yaku de límite no encaja en la mano que se está
 * capturando, y esa respuesta sale de aquí y no de una regla suelta en un `.vue`.
 */
export const LIMIT_YAKU: readonly YakuDefinition[] = [
  limit('kokushiMusou', [CLOSED_HAND]),
  limit('suukantsu', [CLOSED_HAND, HAS_KAN]),
  limit('daisangen', [], 6),
  limit('shousuushii', []),
  limit('daisuushii', []),
  limit('tsuuiisou', []),
  limit('chinroutou', []),
  limit('ryuuiisou', []),
  limit('chuurenPoutou', [CLOSED_HAND]),
  limit('suuchaRiichi', [FIRST_HAND, TSUMO, RIICHI_DECLARED, CLOSED_HAND]),
  limit('sanchuurenhou', [HAS_KAN]),
  limit('tenhou', [FIRST_HAND, TSUMO, CLOSED_HAND]),
  limit('chiihou', [FIRST_HAND, CLOSED_HAND]),
]

/**
 * El catálogo, en el orden en que los nombra `docs/domain.md` §4.2.
 *
 * Los yaku sin condición en esta lista son los que no dependen del contexto de la mano: reconocerlos
 * depende de la estructura de las fichas o de un viento, no de cómo se ganó. Los que sí la llevan son
 * *situacionales*, y son los que RF-22.2 y RF-22.3 obligan a comprobar antes de sumar.
 */
export const YAKU_CATALOG: readonly YakuDefinition[] = [
  normal('riichi', 1, { statKey: 'riichi', conditions: [RIICHI_DECLARED] }),
  normal('ippatsu', 1, { conditions: [RIICHI_DECLARED, NO_KAN] }),
  normal('menzenTsumo', 1, { statKey: 'tsumo', conditions: [CLOSED_HAND, TSUMO] }),
  // CORRECCIÓN del 2026-10-15: el pinfu solo exige mano cerrada y también se reconoce por ron. Las
  // reglas del club no lo decían —decían que los 20 fu planos eran solo un pinfu por tsumo—, así que
  // esto no es una regla heredada sino una corrección de un dato que faltaba, y queda por hacer que
  // sea automática: ver la nota de `computeFu`.
  normal('pinfu', 1, { conditions: [CLOSED_HAND] }),
  normal('tanyao', 1),
  normal('iipeiko', 1, { conditions: [CLOSED_HAND] }),
  normal('haku', 1),
  normal('hatsu', 1),
  normal('chun', 1),
  normal('rinshanKaihou', 1, { statKey: 'rinshanKaihou', conditions: [HAS_KAN] }),
  normal('chankan', 1, { conditions: [RON] }),
  normal('haiteiRaoyue', 1, { statKey: 'haiteiRaoyue', conditions: [TSUMO, FINAL_HAND] }),
  normal('houteiRaoyui', 1, { conditions: [RYUUKYOKU, FINAL_HAND] }),
  normal('chiitoitsu', 2, { conditions: [CLOSED_HAND] }),
  normal('sanshokuDoukou', 2, { conditions: [CLOSED_HAND] }),
  normal('toitoi', 2),
  normal('sanankou', 2),
  normal('sankantsu', 2, { conditions: [CLOSED_HAND, HAS_KAN] }),
  normal('shousangen', 2, { conditions: [CLOSED_HAND] }),
  normal('honroutou', 2, { conditions: [CLOSED_HAND] }),
  normal('junchan', 3, { conditions: [CLOSED_HAND] }),
  normal('ryanpeikou', 3, { conditions: [CLOSED_HAND] }),
  normal('honitsu', 3),
  // El mangan por nagashi solo se declara en un empate agotado, nunca en una mano ganada.
  normal('nagashiMangan', 5, { conditions: [RYUUKYOKU] }),
  normal('chinitsu', 6, { conditions: [CLOSED_HAND] }),
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

/**
 * Condiciones declaradas por un yaku que la mano en curso **no** cumple (RF-22.2).
 *
 * Es la respuesta a «¿por qué este yaku no cuenta?», que la interfaz necesita para señalar el
 * yaku marcado en lugar de limitarse a no sumarlo. Un id fuera del catálogo no tiene condiciones
 * que señalar: no hay regla que haya dejado de cumplirse, simplemente el yaku ya no existe.
 */
export function unmetConditions(id: YakuId, context: YakuContext): readonly YakuCondition[] {
  const definition = findYaku(id)

  if (definition === undefined) {
    return []
  }

  return unmetOf(definition, context)
}

function unmetOf(definition: YakuDefinition, context: YakuContext): readonly YakuCondition[] {
  return definition.conditions.filter((condition) => !conditionHolds(condition, context))
}

/**
 * Si un yaku cuenta en esta mano, según sus condiciones declaradas (RF-22.2).
 *
 * Contesta a la pregunta de *las condiciones*, no a la de *la suma*: un yaku de límite puede
 * cumplir las suyas y aun así no sumar, porque los yaku de límite tienen precedencia sobre el
 * total (RF-22.4). Quien necesite la respuesta completa usa `sumYakuHan`, que distingue los tres
 * motivos por los que un yaku no entra en el total.
 */
export function yakuCountsIn(id: YakuId, context: YakuContext): boolean {
  return unmetConditions(id, context).length === 0
}

export type YakuSumReason = 'counted' | 'conditionsNotMet' | 'limit' | 'unknownYaku'

/** Un yaku seleccionado y qué ha pasado con él en la suma. */
export type YakuSumEntry = {
  readonly id: YakuId
  /** Han del catálogo. Es 0 solo si el yaku ya no está en el catálogo. */
  readonly han: number
  readonly reason: YakuSumReason
  /** Condiciones que la mano no cumple. Vacía cuando el yaku cuenta. */
  readonly unmet: readonly YakuCondition[]
}

export type YakuHanSum = {
  /** Total de han de yaku reales: sin yaku de límite y sin lo que no cuenta (RF-22.1). */
  readonly han: number
  /** Ids de los yaku que sí han entrado en el total, en el orden en que se seleccionaron. */
  readonly counted: readonly YakuId[]
  /** Los que no han entrado, con el motivo, para poder señalarlos en la interfaz (RF-22.3). */
  readonly excluded: readonly YakuSumEntry[]
  /** Todos los seleccionados, en orden: es el desglose que RF-22.6 muestra junto al total. */
  readonly breakdown: readonly YakuSumEntry[]
}

/**
 * Suma de han de los yaku seleccionados (RF-22.1 a RF-22.4).
 *
 * Excluye por `category` los yaku de límite, cuyo han es el valor de referencia y nunca puntúa, y
 * excluye los que no cuentan en esa mano, en lugar de sumarlos y proponer una puntuación que sabe
 * que está mal. Los excluidos vuelven nombrados y con las condiciones que fallan: la interfaz los
 * señala en lugar de borrarlos en silencio.
 *
 * El dora no entra aquí: suma han al valor de la mano (`handValue.ts`), pero nunca sustituye a un
 * yaku real (RF-22.7 y `validateYakuPresence`).
 */
export function sumYakuHan(selected: readonly YakuId[], context: YakuContext): YakuHanSum {
  const breakdown = selected.map((id) => sumEntryOf(id, context))
  const counted = breakdown.filter((entry) => entry.reason === 'counted')

  return {
    han: counted.reduce((total, entry) => total + entry.han, 0),
    counted: counted.map((entry) => entry.id),
    excluded: breakdown.filter((entry) => entry.reason !== 'counted'),
    breakdown,
  }
}

function sumEntryOf(id: YakuId, context: YakuContext): YakuSumEntry {
  const definition = findYaku(id)

  if (definition === undefined) {
    return { id, han: 0, reason: 'unknownYaku', unmet: [] }
  }

  const unmet = unmetOf(definition, context)

  // El límite se mira antes que las condiciones: un yakuman vale 8000 puntos tenga o no las
  // condiciones cumplidas, así que su motivo de exclusión es siempre el mismo y no depende de la
  // mano en la que se capturó.
  if (definition.category === 'limit') {
    return { id, han: definition.han, reason: 'limit', unmet }
  }

  if (unmet.length > 0) {
    return { id, han: definition.han, reason: 'conditionsNotMet', unmet }
  }

  return { id, han: definition.han, reason: 'counted', unmet: [] }
}

/**
 * El `switch` es exhaustivo a propósito, como el de `windOf`: si se añade un tipo de condición y
 * se olvida esta función, el compilador falla en vez de dejar que la condición se ignore en
 * silencio y el yaku cuente siempre.
 */
function conditionHolds(condition: YakuCondition, context: YakuContext): boolean {
  switch (condition.kind) {
    case 'resultType':
      return condition.accepts.includes(context.resultType)
    case 'closedHand':
      return context.isClosedHand
    case 'riichiDeclared':
      return context.hasRiichiDeclared
    case 'hasKan':
      return context.hasKan
    case 'noKan':
      return !context.hasKan
    case 'firstHand':
      return context.isFirstHand
    case 'finalHand':
      return context.isFinalHand
  }
}

export interface FuInput {
  readonly hasChiitoitsu: boolean
  readonly hasPinfu: boolean
  readonly isTsumo: boolean
  readonly isMenzenRon: boolean
  readonly concealedKanCount: number
  readonly closedTriangleCount: number
}

/** Pinfu por tsumo: 20 fu planos, como chiitoitsu. Por ron son 30 (corrección del 2026-10-15). */
export const FU_PINFU = 20

/**
 * Fu de una mano según la tabla de `docs/domain.md` §4.2.
 *
 * *Chiitoitsu* son 25 fu planos y no admite bonificaciones. *Pinfu* son 20 fu planos por tsumo y
 * **30 por ron**, con el +10 de mano cerrada como cualquier otra mano.
 *
 * Ni *pinfu* ni *chiitoitsu* admiten kan ni triángulo cerrado. El resto parte de 20 y suma cada
 * bonificación.
 *
 * **Lo que esta función todavía no hace.** Es la regla, no el camino que la aplica: `computeFu` no
 * tiene consumidor en producción, solo su test, y el `fu` que llega al motor es el que teclea
 * quien captura (`TurnForm.vue`, RF-3.13 de 001). Mientras siga siendo así, el 30 fu del pinfu por
 * ron es algo que hay que saber y escribir, y no algo que el sistema calcule. Hacerlo automático es
 * la parte pendiente de la corrección.
 */
export function computeFu(input: FuInput): number {
  if (input.hasChiitoitsu) {
    return FU_CHIITOITSU
  }

  if (input.hasPinfu) {
    return FU_PINFU + (input.isMenzenRon ? FU_MENZEN_RON : 0)
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
