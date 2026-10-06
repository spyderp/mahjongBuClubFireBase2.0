import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  computeHandValue,
  roundUp,
  ronPayment,
  tsumoPayment,
  validateRepresentable,
} from '@/domain/handValue'
import type { HandValue, TsumoPayment } from '@/domain/handValue'
import type { YakuId } from '@/domain/yaku'

function value(
  yakuHan: number,
  fu: number,
  extra: { readonly doraCount?: number; readonly yaku?: readonly YakuId[] } = {},
): HandValue {
  return computeHandValue({
    yaku: extra.yaku ?? [],
    yakuHan,
    doraCount: extra.doraCount ?? 0,
    fu,
  })
}

describe('T16 · basicPoints con la fórmula fu × 2^(2 + totalHan)', () => {
  it('1 han 30 fu da 240 puntos básicos', () => {
    expect(value(1, 30)).toStrictEqual({
      han: 1,
      fu: 30,
      basicPoints: 240,
      band: 'formula',
    })
  })

  it('4 han 30 fu da 1920 puntos básicos', () => {
    expect(value(4, 30)).toStrictEqual({
      han: 4,
      fu: 30,
      basicPoints: 1920,
      band: 'formula',
    })
  })

  it('los dora suman al totalHan de la fórmula', () => {
    const hand = value(1, 30, { doraCount: 2 })

    expect(hand.han).toBe(3)
    expect(hand.basicPoints).toBe(960)
  })

  it('chiitoitsu 2 han 25 fu da 400, no 25 × 2^2', () => {
    expect(value(2, 25)).toStrictEqual({ han: 2, fu: 25, basicPoints: 400, band: 'formula' })
  })

  it('chiitoitsu 3 han 25 fu da 800', () => {
    expect(value(3, 25)).toStrictEqual({ han: 3, fu: 25, basicPoints: 800, band: 'formula' })
  })
})

describe('T17 · roundUp a la centena', () => {
  it('240 sube a 300', () => {
    expect(roundUp(240)).toBe(300)
  })

  it('2000 se queda en 2000', () => {
    expect(roundUp(2000)).toBe(2000)
  })

  it('1690 sube a 1700', () => {
    expect(roundUp(1690)).toBe(1700)
  })
})

describe('T18 · pago de ron', () => {
  it('1 han 30 fu por ron paga 1000 a no dealer', () => {
    expect(ronPayment(value(1, 30), { honba: 0, winnerIsDealer: false })).toBe(1000)
  })

  it('1 han 30 fu por ron paga 1500 al dealer', () => {
    expect(ronPayment(value(1, 30), { honba: 0, winnerIsDealer: true })).toBe(1500)
  })

  it('un mangan por ron paga 8000 a no dealer y 12000 al dealer', () => {
    expect(ronPayment(value(5, 30), { honba: 0, winnerIsDealer: false })).toBe(8000)
    expect(ronPayment(value(5, 30), { honba: 0, winnerIsDealer: true })).toBe(12000)
  })
})

describe('T19 · pago de tsumo', () => {
  it('1 han 30 fu por tsumo paga 300 de cada no dealer y 500 del dealer', () => {
    const payment = tsumoPayment(value(1, 30), { honba: 0, winnerIsDealer: false })

    expect(payment).toStrictEqual({
      winnerIsDealer: false,
      nonDealerPays: 300,
      dealerPays: 500,
      total: 1100,
    })
  })

  it('el total por tsumo es 1100 frente a 1000 por ron', () => {
    const hand = value(1, 30)
    const tsumo = tsumoPayment(hand, { honba: 0, winnerIsDealer: false })

    if (tsumo.winnerIsDealer) {
      throw new Error('un no dealer nunca devuelve winnerIsDealer: true')
    }

    expect(tsumo.total).toBe(1100)
    expect(ronPayment(hand, { honba: 0, winnerIsDealer: false })).toBe(1000)
  })

  it('un tsumo de dealer de 1 han 30 fu paga 500 de cada uno', () => {
    const payment = tsumoPayment(value(1, 30), { honba: 0, winnerIsDealer: true })

    expect(payment).toStrictEqual({
      winnerIsDealer: true,
      eachPays: 500,
      total: 1500,
    })
  })

  it('un tsumo de no dealer suma cada pago individual, sin redondear el total', () => {
    const payment = tsumoPayment(value(1, 40), { honba: 0, winnerIsDealer: false })

    expect(payment).toStrictEqual({
      winnerIsDealer: false,
      nonDealerPays: 400,
      dealerPays: 700,
      total: 1500,
    })
  })
})

describe('T20 · honba', () => {
  it('con honba 1, un tsumo de dealer de 1 han 30 fu paga 600 de cada uno', () => {
    const payment = tsumoPayment(value(1, 30), { honba: 1, winnerIsDealer: true })

    expect(payment).toStrictEqual({
      winnerIsDealer: true,
      eachPays: 600,
      total: 1800,
    })
  })

  it('con honba 1, un ron de dealer de 1 han 30 fu paga 1800 en total', () => {
    expect(ronPayment(value(1, 30), { honba: 1, winnerIsDealer: true })).toBe(1800)
  })

  it('con honba 1, un ron de no dealer suma los 300 al descartador', () => {
    expect(ronPayment(value(1, 30), { honba: 1, winnerIsDealer: false })).toBe(1300)
  })

  it('con honba 2, el tsumo de no dealer añade 200 a cada pago', () => {
    const payment = tsumoPayment(value(1, 30), { honba: 2, winnerIsDealer: false })

    expect(payment).toStrictEqual({
      winnerIsDealer: false,
      nonDealerPays: 500,
      dealerPays: 700,
      total: 1700,
    })
  })
})

describe('T21 · precedencia de manos límite', () => {
  it('5 han da 2000', () => {
    expect(value(5, 30)).toStrictEqual({ han: 5, fu: 30, basicPoints: 2000, band: 'mangan' })
  })

  it('4 han 40 fu da 2000', () => {
    expect(value(4, 40)).toStrictEqual({ han: 4, fu: 40, basicPoints: 2000, band: 'mangan' })
  })

  it('4 han 30 fu sigue siendo fórmula, sin kiriage mangan', () => {
    expect(value(4, 30)).toStrictEqual({ han: 4, fu: 30, basicPoints: 1920, band: 'formula' })
  })

  it('3 han 70 fu da 2000', () => {
    expect(value(3, 70)).toStrictEqual({ han: 3, fu: 70, basicPoints: 2000, band: 'mangan' })
  })

  it('3 han 60 fu sigue siendo fórmula', () => {
    expect(value(3, 60)).toStrictEqual({ han: 3, fu: 60, basicPoints: 1920, band: 'formula' })
  })

  it('6 y 7 han dan 3000', () => {
    expect(value(6, 30).basicPoints).toBe(3000)
    expect(value(6, 30).band).toBe('haneman')
    expect(value(7, 30).basicPoints).toBe(3000)
  })

  it('8 a 10 han dan 4000', () => {
    expect(value(8, 30).basicPoints).toBe(4000)
    expect(value(8, 30).band).toBe('baiman')
    expect(value(10, 30).basicPoints).toBe(4000)
  })

  it('11 y 12 han dan 6000', () => {
    expect(value(11, 30).basicPoints).toBe(6000)
    expect(value(11, 30).band).toBe('sanbaiman')
    expect(value(12, 30).basicPoints).toBe(6000)
  })

  it('13 han da 8000 aunque no haya ningún yaku de límite', () => {
    expect(value(13, 30)).toStrictEqual({ han: 13, fu: 30, basicPoints: 8000, band: 'yakuman' })
    expect(value(20, 30).basicPoints).toBe(8000)
  })

  it('un yaku de límite produce yakuman con cualquier han', () => {
    expect(value(1, 30, { yaku: ['kokushiMusou'] })).toStrictEqual({
      han: 1,
      fu: 30,
      basicPoints: 8000,
      band: 'yakuman',
    })
  })

  it('cuatro yaku de límite siguen valiendo un único yakuman de 8000', () => {
    const hand = value(6, 30, {
      yaku: ['kokushiMusou', 'daisangen', 'tsuuiisou', 'chinroutou'],
    })

    expect(hand.basicPoints).toBe(8000)
    expect(hand.band).toBe('yakuman')
  })

  it('un yaku normal entre varios no dispara la precedencia de límite', () => {
    const hand = value(6, 30, { yaku: ['riichi', 'chinitsu'] })

    expect(hand.band).toBe('haneman')
    expect(hand.basicPoints).toBe(3000)
  })
})

type TableRow = {
  readonly han: number
  readonly fu: number
  readonly ron: string
  readonly tsumo: string
}

function parseTable(markdown: string, heading: string): readonly TableRow[] {
  const lines = markdown.split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => line.trim() === heading)

  if (headingIndex < 0) {
    throw new Error(`tabla no encontrada: ${heading}`)
  }

  const rows: TableRow[] = []

  for (const line of lines.slice(headingIndex + 1)) {
    if (line.trim().length === 0) {
      continue
    }

    if (!line.trimStart().startsWith('|')) {
      break
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const hanCell = cells[0] ?? ''

    if (!/^\d+$/.test(hanCell)) {
      continue
    }

    const fu = Number.parseInt(cells[1] ?? '', 10)

    if (Number.isNaN(fu)) {
      throw new Error(`fu no numérico en la fila: ${line}`)
    }

    rows.push({
      han: Number.parseInt(hanCell, 10),
      fu,
      ron: cells[2] ?? '',
      tsumo: cells[3] ?? '',
    })
  }

  return rows
}

function parsePoints(cell: string): number {
  return Number.parseInt(cell.replace(/\s/g, ''), 10)
}

function parseTsumoCell(cell: string): readonly number[] {
  return cell.split('/').map((part) => parsePoints(part.trim()))
}

// El entorno happy-dom sustituye la `URL` global por la suya, que resuelve lo relativo
// contra `http://localhost`; para resolver contra `file:///` hace falta la de `node:url`.
const domainDoc = readFileSync(
  fileURLToPath(new NodeURL('../../docs/domain.md', import.meta.url)),
  'utf8',
)
const nonDealerRows = parseTable(domainDoc, '#### Tabla de no dealer')
const dealerRows = parseTable(domainDoc, '#### Tabla de dealer')

function paymentCells(payment: TsumoPayment): readonly number[] {
  return payment.winnerIsDealer ? [payment.eachPays] : [payment.nonDealerPays, payment.dealerPays]
}

function sameCells(actual: readonly number[] | null, expected: readonly number[] | null): boolean {
  if (actual === null || expected === null) {
    return actual === expected
  }

  return (
    actual.length === expected.length && actual.every((cell, index) => cell === expected[index])
  )
}

function describeCells(cells: readonly number[] | number | null): string {
  if (cells === null) {
    return 'N/A'
  }

  return typeof cells === 'number' ? String(cells) : cells.join(' / ')
}

/**
 * Recorre una tabla entera acumulando discrepancias en una lista plana: una celda que no
 * cuadre o una fila `N/A` con una razón distinta de la suya entra en `failures`, y el test
 * único de abajo la saca con `expect(failures).toStrictEqual([])`.
 */
function sweepTable(rows: readonly TableRow[], winnerIsDealer: boolean): readonly string[] {
  const failures: string[] = []

  for (const row of rows) {
    const label = `${row.han} han ${row.fu} fu`
    const hand = value(row.han, row.fu)

    const ron = validateRepresentable({ han: row.han, fu: row.fu, resultType: 'ron' })
    const ronDoc = row.ron === 'N/A' ? null : parsePoints(row.ron)
    const ronFormula = ron.ok ? ronPayment(hand, { honba: 0, winnerIsDealer }) : null

    if (ronDoc !== ronFormula) {
      failures.push(
        `${label} · ron: la tabla dice ${describeCells(ronDoc)} y la fórmula da ${describeCells(ronFormula)}`,
      )
    }

    if (!ron.ok && ron.reason !== 'pinfuOnlyByTsumo') {
      failures.push(`${label} · ron N/A con la razón ${ron.reason}`)
    }

    if (ronDoc === null && row.fu !== 20) {
      failures.push(`${label} · ron N/A con ${row.fu} fu en vez de 20`)
    }

    const tsumo = validateRepresentable({ han: row.han, fu: row.fu, resultType: 'tsumo' })
    const tsumoDoc = row.tsumo === 'N/A' ? null : parseTsumoCell(row.tsumo)
    const tsumoFormula = tsumo.ok
      ? paymentCells(tsumoPayment(hand, { honba: 0, winnerIsDealer }))
      : null

    if (!sameCells(tsumoDoc, tsumoFormula)) {
      failures.push(
        `${label} · tsumo: la tabla dice ${describeCells(tsumoDoc)} y la fórmula da ${describeCells(tsumoFormula)}`,
      )
    }

    if (!tsumo.ok && tsumo.reason !== 'chiitoitsuTsumoWithoutMenzenTsumo') {
      failures.push(`${label} · tsumo N/A con la razón ${tsumo.reason}`)
    }

    if (tsumoDoc === null && !(row.fu === 25 && row.han < 3)) {
      failures.push(`${label} · tsumo N/A con ${row.han} han y ${row.fu} fu`)
    }
  }

  return failures
}

describe('T22 · tabla de puntuación', () => {
  it('las dos tablas tienen 24 filas cada una', () => {
    expect(nonDealerRows).toHaveLength(24)
    expect(dealerRows).toHaveLength(24)
  })

  it('cada celda de la tabla de no dealer cuadra con la fórmula', () => {
    expect(sweepTable(nonDealerRows, false)).toStrictEqual([])
  })

  it('cada celda de la tabla de dealer cuadra con la fórmula', () => {
    expect(sweepTable(dealerRows, true)).toStrictEqual([])
  })

  it('hay 8 celdas N/A de ron y 2 de tsumo entre las dos tablas', () => {
    const allRows = [...nonDealerRows, ...dealerRows]
    const naRon = allRows.filter((row) => row.ron === 'N/A')
    const naTsumo = allRows.filter((row) => row.tsumo === 'N/A')

    expect(naRon).toHaveLength(8)
    expect(naTsumo).toHaveLength(2)
    expect(naRon.every((row) => row.fu === 20)).toBe(true)
    expect(naTsumo.every((row) => row.fu === 25 && row.han < 3)).toBe(true)
  })

  it('20 fu por ron se rechaza, y 30 fu por ron se admite', () => {
    expect(validateRepresentable({ han: 1, fu: 20, resultType: 'ron' })).toStrictEqual({
      ok: false,
      reason: 'pinfuOnlyByTsumo',
    })
    expect(validateRepresentable({ han: 1, fu: 30, resultType: 'ron' })).toStrictEqual({
      ok: true,
    })
    expect(validateRepresentable({ han: 2, fu: 25, resultType: 'ron' })).toStrictEqual({
      ok: true,
    })
  })

  it('25 fu por tsumo se rechaza por debajo de 3 han y se admite con 3 han', () => {
    expect(validateRepresentable({ han: 2, fu: 25, resultType: 'tsumo' })).toStrictEqual({
      ok: false,
      reason: 'chiitoitsuTsumoWithoutMenzenTsumo',
    })
    expect(validateRepresentable({ han: 3, fu: 25, resultType: 'tsumo' })).toStrictEqual({
      ok: true,
    })
    expect(validateRepresentable({ han: 1, fu: 30, resultType: 'tsumo' })).toStrictEqual({
      ok: true,
    })
  })
})

describe('T23 · determinismo del resultado', () => {
  it('el mismo input con las claves en distinto orden da un resultado profundamente igual', () => {
    const first = computeHandValue({
      yaku: ['riichi', 'pinfu'],
      yakuHan: 3,
      doraCount: 2,
      fu: 30,
    })
    const second = computeHandValue({
      fu: 30,
      doraCount: 2,
      yakuHan: 3,
      yaku: ['riichi', 'pinfu'],
    })

    expect(first).toStrictEqual(second)
  })

  it('los pagos con el contexto en distinto orden de claves son idénticos', () => {
    const hand = value(2, 40)

    expect(ronPayment(hand, { honba: 3, winnerIsDealer: true })).toBe(
      ronPayment(hand, { winnerIsDealer: true, honba: 3 }),
    )

    const first: TsumoPayment = tsumoPayment(hand, { honba: 3, winnerIsDealer: false })
    const second: TsumoPayment = tsumoPayment(hand, { winnerIsDealer: false, honba: 3 })

    expect(first).toStrictEqual(second)
  })

  it('las validaciones son estables ante el orden de las claves', () => {
    expect(validateRepresentable({ resultType: 'ron', fu: 20, han: 1 })).toStrictEqual(
      validateRepresentable({ han: 1, fu: 20, resultType: 'ron' }),
    )
  })
})
