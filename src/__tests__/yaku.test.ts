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
  validateChiitoitsuFu,
  validateWindYaku,
  validateYakuPresence,
} from '@/domain/yaku'
import type { Seat } from '@/domain/types'
import type { YakuId, WindYakuId } from '@/domain/yaku'

function hanOf(id: YakuId): number {
  const definition = findYaku(id)

  if (!definition) {
    throw new Error(`yaku desconocido: ${id}`)
  }

  return definition.han
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

  it('pinfu vale 20 fu planos, y no cobra el +10 de mano cerrada', () => {
    expect(computeFu({ ...base, hasPinfu: true })).toBe(20)
    expect(computeFu({ ...base, hasPinfu: true, isMenzenRon: true })).toBe(20)
    expect(computeFu({ ...base, hasPinfu: true, isTsumo: true })).toBe(20)
    expect(FU_PINFU).toBe(20)
  })

  it('pinfu tampoco admite kan ni triangulo cerrado', () => {
    expect(
      computeFu({ ...base, hasPinfu: true, concealedKanCount: 1, closedTriangleCount: 1 }),
    ).toBe(20)
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
