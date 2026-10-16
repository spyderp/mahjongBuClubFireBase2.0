import { describe, expect, it } from 'vitest'
import {
  FU_BASE,
  FU_CHIITOITSU,
  FU_CLOSED_TRIANGLE,
  FU_CONCEALED_KAN,
  FU_MENZEN_RON,
  FU_PINFU,
  FU_TSUMO,
  LIMIT_YAKU,
  YAKU_CATALOG,
  computeFu,
  findYaku,
  isLimitYaku,
  isWindYaku,
  sumYakuHan,
  unmetConditions,
  validateChiitoitsuFu,
  validateWindYaku,
  validateYakuPresence,
  yakuCountsIn,
} from '@/domain/yaku'
import type { ResultType, Seat } from '@/domain/types'
import type {
  YakuCondition,
  YakuContext,
  YakuDefinition,
  YakuId,
  YakuSumEntry,
  WindYakuId,
} from '@/domain/yaku'

function hanOf(id: YakuId): number {
  const definition = findYaku(id)

  if (!definition) {
    throw new Error(`yaku desconocido: ${id}`)
  }

  return definition.han
}

/**
 * Contexto neutro de `yaku.test.ts`: mano abierta, ganada por ron, sin riichi declarado, sin kan
 * y a mitad de partida. Un yaku sin condiciones cuenta en él, y uno con condiciones no.
 */
const NEUTRAL_CONTEXT: YakuContext = {
  resultType: 'ron',
  isClosedHand: false,
  hasRiichiDeclared: false,
  hasKan: false,
  isFirstHand: false,
  isFinalHand: false,
}

function context(overrides: Partial<YakuContext> = {}): YakuContext {
  return { ...NEUTRAL_CONTEXT, ...overrides }
}

const RESULT_TYPES: readonly ResultType[] = ['tsumo', 'ron', 'ryuukyoku', 'chombo']
const FLAGS = [false, true] as const

/** Los 128 contextos posibles: cuatro resultados y cinco indicadores booleanos. */
const ALL_CONTEXTS: readonly YakuContext[] = RESULT_TYPES.flatMap((resultType) =>
  FLAGS.flatMap((isClosedHand) =>
    FLAGS.flatMap((hasRiichiDeclared) =>
      FLAGS.flatMap((hasKan) =>
        FLAGS.flatMap((isFirstHand) =>
          FLAGS.map((isFinalHand) => ({
            resultType,
            isClosedHand,
            hasRiichiDeclared,
            hasKan,
            isFirstHand,
            isFinalHand,
          })),
        ),
      ),
    ),
  ),
)

/**
 * Oráculo independiente del módulo: relee las condiciones declaradas sin llamar a
 * `yakuCountsIn`. Que los dos coincidan en los 128 contextos y en los 46 yaku del catálogo es lo
 * que demuestra que la función no tiene un atajo escondido.
 */
function oracle(definition: YakuDefinition, where: YakuContext): boolean {
  return definition.conditions.every((condition) => {
    switch (condition.kind) {
      case 'resultType':
        return condition.accepts.includes(where.resultType)
      case 'closedHand':
        return where.isClosedHand
      case 'riichiDeclared':
        return where.hasRiichiDeclared
      case 'hasKan':
        return where.hasKan
      case 'noKan':
        return !where.hasKan
      case 'firstHand':
        return where.isFirstHand
      case 'finalHand':
        return where.isFinalHand
    }
  })
}

describe('T10 · catálogo de yaku normales con su han', () => {
  it('riichi vale 1 han', () => {
    expect(hanOf('riichi')).toBe(1)
  })

  it('iipeiko vale 1 han', () => {
    expect(hanOf('iipeiko')).toBe(1)
  })

  it('chinitsu vale 6 han', () => {
    expect(hanOf('chinitsu')).toBe(6)
  })

  it('daisangen conserva su han de referencia 6, pero es yaku de límite', () => {
    expect(hanOf('daisangen')).toBe(6)
    expect(isLimitYaku('daisangen')).toBe(true)
  })

  it('el catálogo da al menos 1 han a todo yaku normal', () => {
    const normals = YAKU_CATALOG.filter((definition) => definition.category === 'normal')

    expect(normals.length).toBeGreaterThan(0)

    for (const definition of normals) {
      expect(definition.han).toBeGreaterThanOrEqual(1)
    }
  })

  it('ningún yaku normal llega a 13 han, porque 13 han es yakuman', () => {
    const reachingYakumanByHan = YAKU_CATALOG.filter(
      (definition) => definition.category === 'normal' && definition.han >= 13,
    )

    expect(reachingYakumanByHan).toStrictEqual([])
  })

  it('los yaku que dependen de la estructura de la mano exigen mano cerrada', () => {
    const structural: readonly YakuId[] = [
      'iipeiko',
      'sanshokuDoukou',
      'sankantsu',
      'shousangen',
      'honroutou',
      'junchan',
      'ryanpeikou',
      'chinitsu',
    ]

    for (const id of structural) {
      expect(findYaku(id)?.requiresClosedHand).toBe(true)
    }

    expect(findYaku('toitoi')?.requiresClosedHand).toBe(false)
    expect(findYaku('sanankou')?.requiresClosedHand).toBe(false)
  })

  it('expone la clave de estadística solo en los yaku que RF-12.4 contabiliza', () => {
    expect(findYaku('riichi')?.statKey).toBe('riichi')
    expect(findYaku('menzenTsumo')?.statKey).toBe('tsumo')
    expect(findYaku('haiteiRaoyue')?.statKey).toBe('haiteiRaoyue')
    expect(findYaku('rinshanKaihou')?.statKey).toBe('rinshanKaihou')
    expect(findYaku('pinfu')?.statKey).toBeNull()
    expect(findYaku('dora' as YakuId)?.statKey).toBeUndefined()
  })

  it('findYaku devuelve undefined para un id fuera del catálogo', () => {
    expect(findYaku('noExiste' as YakuId)).toBeUndefined()
  })
})

describe('T11 · catálogo de los trece yaku de límite', () => {
  it('cuenta exactamente trece entradas', () => {
    expect(LIMIT_YAKU).toHaveLength(13)
    expect(YAKU_CATALOG.filter((definition) => definition.category === 'limit')).toHaveLength(13)
  })

  it('reconoce los trece yaku que nombra docs/domain.md', () => {
    const ids = LIMIT_YAKU.map((definition) => definition.id)

    expect(ids).toStrictEqual([
      'kokushiMusou',
      'suukantsu',
      'daisangen',
      'shousuushii',
      'daisuushii',
      'tsuuiisou',
      'chinroutou',
      'ryuuiisou',
      'chuurenPoutou',
      'suuchaRiichi',
      'sanchuurenhou',
      'tenhou',
      'chiihou',
    ])
  })

  it('marca las trece como yaku de límite', () => {
    for (const definition of LIMIT_YAKU) {
      expect(definition.category).toBe('limit')
      expect(isLimitYaku(definition.id)).toBe(true)
    }
  })

  it('isLimitYaku distingue un yaku normal', () => {
    expect(isLimitYaku('riichi')).toBe(false)
    expect(isLimitYaku('toitoi')).toBe(false)
  })

  it('ningún yaku de límite se declara dos veces en el catálogo', () => {
    const ids = YAKU_CATALOG.map((definition) => definition.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * Desviación nº 3 de `docs/domain.md` §4.5: el double riichi no se reconoce. No existe entrada
   * en el catálogo y el único yaku de riichi puntúa 1 han, aunque la mano reúna las dos
   * condiciones (riichi e ippatsu).
   */
  it('no reconoce el double riichi (desviación nº 3 de docs/domain.md §4.5)', () => {
    expect(findYaku('doubleRiichi' as YakuId)).toBeUndefined()

    const normalRiichiLike = YAKU_CATALOG.filter(
      (definition) => definition.category === 'normal' && /riichi/i.test(definition.id),
    )

    expect(normalRiichiLike.map((definition) => definition.id)).toEqual(['riichi'])
    expect(normalRiichiLike[0]?.han).toBe(1)
    expect(hanOf('riichi') + hanOf('ippatsu')).toBe(2)
  })
})

describe('T12 · reglas de fu', () => {
  const base = {
    hasChiitoitsu: false,
    hasPinfu: false,
    isTsumo: false,
    isMenzenRon: false,
    concealedKanCount: 0,
    closedTriangleCount: 0,
  }

  it('parte de 20 fu cualquier mano', () => {
    expect(computeFu(base)).toBe(20)
    expect(FU_BASE).toBe(20)
  })

  it('chiitoitsu vale 25 fu', () => {
    expect(computeFu({ ...base, hasChiitoitsu: true })).toBe(25)
    expect(FU_CHIITOITSU).toBe(25)
  })

  it('chiitoitsu no admite las bonificaciones de la base', () => {
    expect(
      computeFu({
        hasChiitoitsu: true,
        hasPinfu: false,
        isTsumo: true,
        isMenzenRon: true,
        concealedKanCount: 2,
        closedTriangleCount: 1,
      }),
    ).toBe(25)
  })

  it('pinfu por tsumo son 20 fu planos, y no cobra el +2 de tsumo', () => {
    expect(computeFu({ ...base, hasPinfu: true })).toBe(20)
    expect(computeFu({ ...base, hasPinfu: true, isTsumo: true })).toBe(20)
    expect(FU_PINFU).toBe(20)
  })

  /**
   * Decisión del club: el pinfu es mano cerrada y **también se reconoce por ron**, donde son 30 fu
   * —los 20 planos más el +10 de mano cerrada—. No es una mano de 20 fu por tsumo con el ron
   * prohibido: es un pinfu que se puntúa con la bonificación del ron, como cualquier otra.
   */
  it('pinfu por ron son 30 fu, con el +10 de mano cerrada', () => {
    expect(computeFu({ ...base, hasPinfu: true, isMenzenRon: true })).toBe(30)
    expect(computeFu({ ...base, hasPinfu: true, isMenzenRon: true, isTsumo: true })).toBe(30)
  })

  it('pinfu no admite kan ni triangulo cerrado, salga por tsumo o por ron', () => {
    expect(
      computeFu({ ...base, hasPinfu: true, concealedKanCount: 1, closedTriangleCount: 1 }),
    ).toBe(20)
    expect(
      computeFu({
        ...base,
        hasPinfu: true,
        isMenzenRon: true,
        concealedKanCount: 1,
        closedTriangleCount: 1,
      }),
    ).toBe(30)
  })

  it('suma 10 por ron a mano cerrada', () => {
    expect(computeFu({ ...base, isMenzenRon: true })).toBe(30)
    expect(FU_MENZEN_RON).toBe(10)
  })

  it('suma 2 por tsumo', () => {
    expect(computeFu({ ...base, isTsumo: true })).toBe(22)
    expect(FU_TSUMO).toBe(2)
  })

  it('suma 2 por triangulo cerrado', () => {
    expect(computeFu({ ...base, closedTriangleCount: 1 })).toBe(22)
    expect(FU_CLOSED_TRIANGLE).toBe(2)
  })

  it('suma 2 por cada kan concealed', () => {
    expect(computeFu({ ...base, concealedKanCount: 1 })).toBe(22)
    expect(computeFu({ ...base, concealedKanCount: 2 })).toBe(24)
    expect(FU_CONCEALED_KAN).toBe(2)
  })

  it('acumula todas las bonificaciones', () => {
    expect(
      computeFu({ ...base, isMenzenRon: true, concealedKanCount: 2, closedTriangleCount: 1 }),
    ).toBe(36)
  })

  it('triangulo cerrado y kan concealed son bonificaciones distintas', () => {
    const oneOfEach = computeFu({ ...base, closedTriangleCount: 1, concealedKanCount: 1 })

    expect(oneOfEach).toBe(24)
  })
})

describe('T13 · validacion de yaku de viento contra asiento y ronda', () => {
  const eastSeat = { seat: 'east', roundWind: 'south' } as const

  it('acepta el yaku de viento del asiento del jugador', () => {
    expect(validateWindYaku(['seatEast'], eastSeat)).toStrictEqual({ ok: true })
  })

  it('rechaza el yaku de un viento que no es ni el asiento ni la ronda', () => {
    expect(validateWindYaku(['seatNorth'], eastSeat)).toStrictEqual({
      ok: false,
      reason: 'windNotOwned',
      yaku: 'seatNorth',
    })
  })

  it('acepta el yaku del viento de ronda', () => {
    expect(validateWindYaku(['roundSouth'], eastSeat)).toStrictEqual({ ok: true })
  })

  it('rechaza el yaku de un viento de ronda que no es el de la ronda', () => {
    expect(validateWindYaku(['roundWest'], eastSeat)).toStrictEqual({
      ok: false,
      reason: 'windNotOwned',
      yaku: 'roundWest',
    })
  })

  it('acepta a la vez el viento de asiento y el de ronda si son distintos', () => {
    expect(validateWindYaku(['seatEast', 'roundSouth'], eastSeat)).toStrictEqual({ ok: true })
  })

  it('señala el primer yaku de viento invalido', () => {
    const declared: readonly YakuId[] = ['riichi', 'roundNorth', 'seatWest']

    expect(validateWindYaku(declared, eastSeat)).toStrictEqual({
      ok: false,
      reason: 'windNotOwned',
      yaku: 'roundNorth',
    })
  })

  it('ignora los yaku que no son de viento', () => {
    const declared: readonly YakuId[] = ['riichi', 'pinfu', 'menzenTsumo', 'haku']

    expect(validateWindYaku(declared, eastSeat)).toStrictEqual({ ok: true })
  })

  it('acepta una mano sin yaku de viento', () => {
    expect(validateWindYaku([], eastSeat)).toStrictEqual({ ok: true })
  })

  it('isWindYaku separa los yaku de viento del resto', () => {
    const wind: WindYakuId = 'seatEast'

    expect(isWindYaku(wind)).toBe(true)
    expect(isWindYaku('riichi')).toBe(false)
  })

  it('mapea los ocho yaku de viento a su viento', () => {
    const pairs = [
      { yaku: 'seatEast', wind: 'east' },
      { yaku: 'seatSouth', wind: 'south' },
      { yaku: 'seatWest', wind: 'west' },
      { yaku: 'seatNorth', wind: 'north' },
      { yaku: 'roundEast', wind: 'east' },
      { yaku: 'roundSouth', wind: 'south' },
      { yaku: 'roundWest', wind: 'west' },
      { yaku: 'roundNorth', wind: 'north' },
    ] as const satisfies readonly { readonly yaku: WindYakuId; readonly wind: Seat }[]

    for (const { yaku, wind } of pairs) {
      expect(validateWindYaku([yaku], { seat: wind, roundWind: 'east' })).toStrictEqual({
        ok: true,
      })
    }
  })

  it('rechaza los ocho yaku de viento cuando el jugador no posee ese viento', () => {
    const pairs = [
      { yaku: 'seatEast', wind: 'east' },
      { yaku: 'seatSouth', wind: 'south' },
      { yaku: 'seatWest', wind: 'west' },
      { yaku: 'seatNorth', wind: 'north' },
      { yaku: 'roundEast', wind: 'east' },
      { yaku: 'roundSouth', wind: 'south' },
      { yaku: 'roundWest', wind: 'west' },
      { yaku: 'roundNorth', wind: 'north' },
    ] as const satisfies readonly { readonly yaku: WindYakuId; readonly wind: Seat }[]

    for (const { yaku, wind } of pairs) {
      const other = wind === 'east' ? 'south' : 'east'

      expect(validateWindYaku([yaku], { seat: other, roundWind: other })).toStrictEqual({
        ok: false,
        reason: 'windNotOwned',
        yaku,
      })
    }
  })
})

describe('T14 · validacion de chiitoitsu contra los fu', () => {
  it('rechaza 25 fu sin chiitoitsu', () => {
    expect(validateChiitoitsuFu(25, false)).toStrictEqual({
      ok: false,
      reason: 'fuWithoutChiitoitsu',
    })
  })

  it('rechaza chiitoitsu con 30 fu', () => {
    expect(validateChiitoitsuFu(30, true)).toStrictEqual({
      ok: false,
      reason: 'fuWithChiitoitsu',
    })
  })

  it('rechaza chiitoitsu con 20 fu, porque 25 es su unico valor', () => {
    expect(validateChiitoitsuFu(20, true)).toStrictEqual({
      ok: false,
      reason: 'fuWithChiitoitsu',
    })
  })

  it('acepta 25 fu con chiitoitsu', () => {
    expect(validateChiitoitsuFu(25, true)).toStrictEqual({ ok: true })
  })

  it('acepta cualquier otro fu sin chiitoitsu', () => {
    expect(validateChiitoitsuFu(30, false)).toStrictEqual({ ok: true })
    expect(validateChiitoitsuFu(20, false)).toStrictEqual({ ok: true })
    expect(validateChiitoitsuFu(40, false)).toStrictEqual({ ok: true })
  })
})

describe('T15 · exigencia de al menos un yaku real', () => {
  it('rechaza yakuHan en cero aunque haya 13 dora', () => {
    expect(validateYakuPresence({ yakuHan: 0, doraCount: 13 })).toStrictEqual({
      ok: false,
      reason: 'noYaku',
    })
  })

  it('rechaza yakuHan negativo', () => {
    expect(validateYakuPresence({ yakuHan: -1, doraCount: 0 })).toStrictEqual({
      ok: false,
      reason: 'noYaku',
    })
  })

  it('acepta un solo han de yaku real', () => {
    expect(validateYakuPresence({ yakuHan: 1, doraCount: 0 })).toStrictEqual({ ok: true })
  })

  it('acepta dora sin yaku mientras haya yaku real', () => {
    expect(validateYakuPresence({ yakuHan: 2, doraCount: 5 })).toStrictEqual({ ok: true })
  })
})

/**
 * RF-22.2 y hallazgo A4 de `docs/reviews/002-qa.md`: el catálogo dice *cuándo* cuenta cada yaku, no
 * solo cuánto vale. El contexto es lo que la mesa conoce de la mano: resultado, si está cerrada,
 * si hay riichi, si hubo kan, y si es la primera o la última mano de la partida.
 */
describe('T17 · condiciones en las que cuenta cada yaku', () => {
  const TSUMO: YakuCondition = { kind: 'resultType', accepts: ['tsumo'] }
  const RON: YakuCondition = { kind: 'resultType', accepts: ['ron'] }
  const DRAW: YakuCondition = { kind: 'resultType', accepts: ['ryuukyoku'] }
  const CLOSED: YakuCondition = { kind: 'closedHand' }
  const RIICHI: YakuCondition = { kind: 'riichiDeclared' }
  const KAN: YakuCondition = { kind: 'hasKan' }
  const NO_KAN: YakuCondition = { kind: 'noKan' }
  const FIRST: YakuCondition = { kind: 'firstHand' }
  const FINAL: YakuCondition = { kind: 'finalHand' }

  it('todo yaku del catálogo declara sus condiciones, y son una lista', () => {
    for (const definition of YAKU_CATALOG) {
      expect(Array.isArray(definition.conditions)).toBe(true)
    }
  })

  it('tenhou y chiihou declaran la primera mano', () => {
    expect(findYaku('tenhou')?.conditions).toStrictEqual([FIRST, TSUMO, CLOSED])
    expect(findYaku('chiihou')?.conditions).toStrictEqual([FIRST, CLOSED])
  })

  it('cada yaku situacional declara exactamente las condiciones que lo hacen contar', () => {
    const expected: readonly (readonly [YakuId, readonly YakuCondition[]])[] = [
      ['riichi', [RIICHI]],
      ['ippatsu', [RIICHI, NO_KAN]],
      ['menzenTsumo', [CLOSED, TSUMO]],
      ['pinfu', [CLOSED]],
      ['rinshanKaihou', [KAN]],
      ['chankan', [RON]],
      ['haiteiRaoyue', [TSUMO, FINAL]],
      ['houteiRaoyui', [DRAW, FINAL]],
      ['chiitoitsu', [CLOSED]],
      ['sankantsu', [CLOSED, KAN]],
      ['nagashiMangan', [DRAW]],
      ['kokushiMusou', [CLOSED]],
      ['suukantsu', [CLOSED, KAN]],
      ['chuurenPoutou', [CLOSED]],
      ['suuchaRiichi', [FIRST, TSUMO, RIICHI, CLOSED]],
      ['sanchuurenhou', [KAN]],
    ]

    for (const [id, conditions] of expected) {
      expect(findYaku(id)?.conditions).toStrictEqual(conditions)
    }
  })

  it('los yaku que no dependen del contexto declaran la lista vacía, no la omiten', () => {
    const unconditional: readonly YakuId[] = [
      'tanyao',
      'haku',
      'hatsu',
      'chun',
      'toitoi',
      'sanankou',
      'honitsu',
      'seatEast',
      'roundNorth',
      'daisangen',
      'tsuuiisou',
    ]

    for (const id of unconditional) {
      expect(findYaku(id)?.conditions).toStrictEqual([])
    }
  })

  /**
   * Decisión del club, 2026-10-15: el pinfu solo exige mano cerrada, y se reconoce tanto por tsumo
   * como por ron. La versión anterior de esta tabla le exigía tsumo, que era lo que `docs/domain.md`
   * §4.2 daba por hecho; el club lo corrigió porque un pinfu por ron son 30 fu y no es una mano
   * imposible.
   */
  it('pinfu solo exige mano cerrada, y cuenta por ron y por tsumo', () => {
    const closedRon = context({ isClosedHand: true, resultType: 'ron' })

    expect(findYaku('pinfu')?.conditions).toStrictEqual([CLOSED])
    expect(yakuCountsIn('pinfu', closedRon)).toBe(true)
    expect(yakuCountsIn('pinfu', context({ isClosedHand: true, resultType: 'tsumo' }))).toBe(true)
    expect(yakuCountsIn('pinfu', context({ isClosedHand: true, resultType: 'ryuukyoku' }))).toBe(
      true,
    )
    expect(yakuCountsIn('pinfu', context({ isClosedHand: false, resultType: 'ron' }))).toBe(false)
    expect(unmetConditions('pinfu', context({ isClosedHand: false }))).toStrictEqual([CLOSED])
  })

  it('ningún yaku declara dos veces la misma condición', () => {
    for (const definition of YAKU_CATALOG) {
      const keys = definition.conditions.map((condition) => JSON.stringify(condition))

      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  /**
   * `requiresClosedHand` no es un segundo catálogo: se deriva de la condición `closedHand`. Si
   * mañana un yaku exige mano cerrada y su lista no lo dice, este test falla en lugar de que los
   * dos campos empiecen a discrepar en silencio.
   */
  it('requiresClosedHand se deriva de las condiciones y no se declara dos veces', () => {
    for (const definition of YAKU_CATALOG) {
      const closedByCondition = definition.conditions.some(
        (condition) => condition.kind === 'closedHand',
      )

      expect(definition.requiresClosedHand).toBe(closedByCondition)
    }
  })

  it('un yaku solo cuenta si ninguna de sus condiciones queda sin cumplir', () => {
    const closed = context({ isClosedHand: true })

    expect(unmetConditions('menzenTsumo', closed)).toStrictEqual([TSUMO])
    expect(unmetConditions('menzenTsumo', context())).toStrictEqual([CLOSED, TSUMO])
    expect(
      unmetConditions('menzenTsumo', context({ isClosedHand: true, resultType: 'tsumo' })),
    ).toStrictEqual([])
    expect(unmetConditions('tanyao', context())).toStrictEqual([])
  })

  it('un id fuera del catálogo no tiene condiciones sin cumplir que señalar', () => {
    expect(unmetConditions('noExiste' as YakuId, context())).toStrictEqual([])
  })
})

describe('T18 · suma de han del catálogo', () => {
  const closedTsumo = context({ isClosedHand: true, resultType: 'tsumo' })

  it('suma el han de cada yaku que cuenta en esa mano', () => {
    const sum = sumYakuHan(['tanyao', 'haku', 'pinfu'], closedTsumo)

    expect(sum.han).toBe(3)
    expect(sum.counted).toStrictEqual(['tanyao', 'haku', 'pinfu'])
    expect(sum.excluded).toStrictEqual([])
  })

  it('excluye los yaku de límite por category, aunque sus condiciones se cumplan', () => {
    const firstHand = context({ isClosedHand: true, resultType: 'tsumo', isFirstHand: true })
    const sum = sumYakuHan(['tenhou', 'tanyao'], firstHand)

    expect(unmetConditions('tenhou', firstHand)).toStrictEqual([])
    expect(sum.han).toBe(1)
    expect(sum.counted).toStrictEqual(['tanyao'])
    expect(sum.excluded).toStrictEqual([{ id: 'tenhou', han: 13, reason: 'limit', unmet: [] }])
  })

  it('excluye los yaku que no cuentan en ese contexto y los señala', () => {
    const sum = sumYakuHan(['menzenTsumo', 'tanyao'], context())

    expect(sum.han).toBe(1)
    expect(sum.counted).toStrictEqual(['tanyao'])
    expect(sum.excluded).toStrictEqual([
      {
        id: 'menzenTsumo',
        han: 1,
        reason: 'conditionsNotMet',
        unmet: [{ kind: 'closedHand' }, { kind: 'resultType', accepts: ['tsumo'] }],
      },
    ])
  })

  it('devuelve cero sin yaku seleccionados', () => {
    const sum = sumYakuHan([], closedTsumo)

    expect(sum.han).toBe(0)
    expect(sum.counted).toStrictEqual([])
    expect(sum.excluded).toStrictEqual([])
    expect(sum.breakdown).toStrictEqual([])
  })

  it('el desglose conserva el orden en que se seleccionaron los yaku', () => {
    const sum = sumYakuHan(['chinitsu', 'toitoi', 'riichi'], closedTsumo)

    expect(sum.breakdown.map((entry) => entry.id)).toStrictEqual(['chinitsu', 'toitoi', 'riichi'])
  })

  it('el total es la suma del han de las entradas contadas, y nada más', () => {
    const selected: readonly YakuId[] = [
      'riichi',
      'ippatsu',
      'menzenTsumo',
      'tanyao',
      'chiitoitsu',
      'daisangen',
    ]
    const sum = sumYakuHan(selected, context({ isClosedHand: true, hasRiichiDeclared: true }))
    const fromBreakdown = sum.breakdown
      .filter((entry) => entry.reason === 'counted')
      .reduce((total, entry) => total + entry.han, 0)

    expect(sum.han).toBe(fromBreakdown)
    expect(sum.han).toBe(5)
    expect(sum.breakdown.filter((entry) => entry.reason === 'limit')).toStrictEqual([
      { id: 'daisangen', han: 6, reason: 'limit', unmet: [] },
    ])
  })

  it('un id que ya no está en el catálogo no suma ni estalla', () => {
    const sum = sumYakuHan(['noExiste' as YakuId, 'tanyao'], context())

    expect(sum.han).toBe(1)
    expect(sum.counted).toStrictEqual(['tanyao'])
    expect(sum.excluded).toStrictEqual([
      { id: 'noExiste', han: 0, reason: 'unknownYaku', unmet: [] },
    ])
  })
})

/**
 * Única entrada del desglose de un yaku seleccionado, o fallo: los barridos trabajan de uno en
 * uno, así que un desglose vacío ahí es un fallo del módulo y no un dato.
 */
function entryOf(id: YakuId, where: YakuContext): YakuSumEntry {
  const [entry] = sumYakuHan([id], where).breakdown

  if (entry === undefined) {
    throw new Error(`sin desglose para ${id}`)
  }

  return entry
}

/**
 * Barrido de invariante, no de ejemplo: cada yaku con condición se prueba en **todos** los
 * contextos que puede tener la mano. Es el que cierra el hallazgo A4, el que proponía sumas
 * imposibles como marcar menzen tsumo en un ron.
 */
describe('T19 · yaku situacionales', () => {
  const situational = YAKU_CATALOG.filter((definition) => definition.conditions.length > 0)

  it('el barrido recorre los 128 contextos que puede tener una mano', () => {
    expect(ALL_CONTEXTS).toHaveLength(128)
    expect(situational.length).toBeGreaterThan(0)
    expect(situational.length).toBeLessThan(YAKU_CATALOG.length)
  })

  it('yakuCountsIn coincide con el orículo en los 128 contextos de los 46 yaku', () => {
    for (const definition of YAKU_CATALOG) {
      for (const where of ALL_CONTEXTS) {
        expect(yakuCountsIn(definition.id, where)).toBe(oracle(definition, where))
      }
    }
  })

  it('cada yaku con condición tiene un contexto válido y al menos tres inválidos', () => {
    for (const definition of situational) {
      const valid = ALL_CONTEXTS.filter((where) => oracle(definition, where))
      const invalid = ALL_CONTEXTS.filter((where) => !oracle(definition, where))

      expect(valid.length, `${definition.id} sin ningún contexto válido`).toBeGreaterThan(0)
      expect(
        invalid.length,
        `${definition.id} con menos de tres contextos inválidos`,
      ).toBeGreaterThanOrEqual(3)

      for (const where of valid) {
        expect(yakuCountsIn(definition.id, where)).toBe(true)
        expect(unmetConditions(definition.id, where)).toStrictEqual([])
      }

      for (const where of invalid) {
        expect(yakuCountsIn(definition.id, where)).toBe(false)
        expect(unmetConditions(definition.id, where).length).toBeGreaterThan(0)
      }
    }
  })

  it('un yaku sin condición cuenta en los 128 contextos', () => {
    const unconditional = YAKU_CATALOG.filter((definition) => definition.conditions.length === 0)

    for (const definition of unconditional) {
      for (const where of ALL_CONTEXTS) {
        expect(yakuCountsIn(definition.id, where)).toBe(true)
      }
    }
  })

  it('la suma coincide con el oráculo yaku a yaku en los 128 contextos', () => {
    const normals = YAKU_CATALOG.filter((definition) => definition.category === 'normal')
    const limits = YAKU_CATALOG.filter((definition) => definition.category === 'limit')

    for (const definition of normals) {
      for (const where of ALL_CONTEXTS) {
        const counts = oracle(definition, where)
        const entry = entryOf(definition.id, where)

        expect(sumYakuHan([definition.id], where).han).toBe(counts ? definition.han : 0)
        expect(entry.reason).toBe(counts ? 'counted' : 'conditionsNotMet')
        expect(entry.unmet.length > 0).toBe(!counts)
      }
    }

    for (const definition of limits) {
      for (const where of ALL_CONTEXTS) {
        expect(sumYakuHan([definition.id], where).han).toBe(0)
        expect(entryOf(definition.id, where).reason).toBe('limit')
      }
    }
  })

  /**
   * Caso 34 de `specs/002/spec.md`: menzen tsumo marcado en un ron. No cuenta, se señala y la
   * suma se queda sin ese han.
   */
  it('caso 34 · menzen tsumo por ron no suma', () => {
    const ron = context({ isClosedHand: true, resultType: 'ron' })
    const sum = sumYakuHan(['menzenTsumo', 'tanyao'], ron)

    expect(yakuCountsIn('menzenTsumo', ron)).toBe(false)
    expect(unmetConditions('menzenTsumo', ron)).toStrictEqual([
      { kind: 'resultType', accepts: ['tsumo'] },
    ])
    expect(sum.han).toBe(1)
    expect(sum.excluded[0]?.id).toBe('menzenTsumo')
    expect(sum.excluded[0]?.reason).toBe('conditionsNotMet')
  })

  /**
   * El otro lado del caso 34: el pinfu en ese mismo ron sí cuenta, porque solo exige mano cerrada.
   * Es la diferencia entre un yaku con condición de resultado y un yaku que no la tiene.
   */
  it('pinfu por ron a mano cerrada sí suma, en la misma mano que el caso 34', () => {
    const ron = context({ isClosedHand: true, resultType: 'ron' })
    const sum = sumYakuHan(['pinfu', 'menzenTsumo'], ron)

    expect(sum.han).toBe(1)
    expect(sum.counted).toStrictEqual(['pinfu'])
    expect(sum.excluded.map((entry) => entry.id)).toStrictEqual(['menzenTsumo'])
  })

  /** Caso 35: ippatsu sin riichi declarado. */
  it('caso 35 · ippatsu sin riichi declarado no suma', () => {
    const noRiichi = context({ hasRiichiDeclared: false })
    const sum = sumYakuHan(['ippatsu'], noRiichi)

    expect(yakuCountsIn('ippatsu', noRiichi)).toBe(false)
    expect(sum.han).toBe(0)
    expect(sum.excluded).toStrictEqual([
      { id: 'ippatsu', han: 1, reason: 'conditionsNotMet', unmet: [{ kind: 'riichiDeclared' }] },
    ])
  })

  /** Caso 36: rinshan kaihou en una mano sin kan. */
  it('caso 36 · rinshan sin kan no suma', () => {
    const noKan = context({ hasKan: false })
    const sum = sumYakuHan(['rinshanKaihou'], noKan)

    expect(yakuCountsIn('rinshanKaihou', noKan)).toBe(false)
    expect(sum.han).toBe(0)
    expect(sum.excluded).toStrictEqual([
      { id: 'rinshanKaihou', han: 1, reason: 'conditionsNotMet', unmet: [{ kind: 'hasKan' }] },
    ])
  })

  it('los tres casos de la spec siguen creando una mano sin ningún yaku real', () => {
    const sum = sumYakuHan(['menzenTsumo', 'ippatsu', 'rinshanKaihou'], context())

    expect(sum.han).toBe(0)
    expect(validateYakuPresence({ yakuHan: sum.han, doraCount: 5 })).toStrictEqual({
      ok: false,
      reason: 'noYaku',
    })
  })
})
