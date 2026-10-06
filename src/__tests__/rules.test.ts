import { describe, expect, it } from 'vitest'
import { canFinalize, isRenchan, minTurns, needsExtension, nextHand } from '@/domain/rules'
import type { HandOutcome, HandState } from '@/domain/rules'
import type { Seat } from '@/domain/types'

function hand(
  dealer: Seat,
  overrides: { readonly wind?: Seat; readonly honba?: number } = {},
): HandState {
  return { wind: overrides.wind ?? 'east', dealer, honba: overrides.honba ?? 0 }
}

describe('T36 · mínimo de turnos por modo', () => {
  it('tonpuusen exige 4 manos', () => {
    expect(minTurns('tonpuusen')).toBe(4)
    expect(canFinalize(3, 'tonpuusen')).toBe(false)
    expect(canFinalize(4, 'tonpuusen')).toBe(true)
    expect(canFinalize(10, 'tonpuusen')).toBe(true)
  })

  it('hanchan exige 8 manos', () => {
    expect(minTurns('hanchan')).toBe(8)
    expect(canFinalize(7, 'hanchan')).toBe(false)
    expect(canFinalize(8, 'hanchan')).toBe(true)
    expect(canFinalize(9, 'hanchan')).toBe(true)
  })

  it('por debajo del mínimo canFinalize es falso para ambos modos', () => {
    expect(canFinalize(0, 'tonpuusen')).toBe(false)
    expect(canFinalize(0, 'hanchan')).toBe(false)
  })
})

describe('T37 · localía y honba por turno', () => {
  it('la localía avanza por asiento cuando el dealer no gana y el honba sube', () => {
    expect(nextHand(hand('east'), { type: 'otherWin' })).toStrictEqual({
      wind: 'east',
      dealer: 'south',
      honba: 1,
    })
  })

  it('la rotación recorre este, sur, oeste y norte y el viento avanza al volver a este', () => {
    const second = nextHand(hand('east'), { type: 'otherWin' })
    const third = nextHand(second, { type: 'otherWin' })
    const fourth = nextHand(third, { type: 'otherWin' })
    const fifth = nextHand(fourth, { type: 'otherWin' })

    expect(second).toStrictEqual({ wind: 'east', dealer: 'south', honba: 1 })
    expect(third).toStrictEqual({ wind: 'east', dealer: 'west', honba: 2 })
    expect(fourth).toStrictEqual({ wind: 'east', dealer: 'north', honba: 3 })
    expect(fifth).toStrictEqual({ wind: 'south', dealer: 'east', honba: 4 })
  })

  it('el honba vuelve a cero cuando el dealer gana', () => {
    const first: HandState = { wind: 'south', dealer: 'east', honba: 3 }

    expect(nextHand(first, { type: 'dealerWin' })).toStrictEqual({
      wind: 'south',
      dealer: 'east',
      honba: 0,
    })
  })

  it('el honba se incrementa cuando el dealer no gana, con la localía de oeste a norte', () => {
    const first: HandState = { wind: 'west', dealer: 'north', honba: 2 }

    expect(nextHand(first, { type: 'otherDraw' })).toStrictEqual({
      wind: 'north',
      dealer: 'east',
      honba: 3,
    })
  })

  it('solo hay renchan cuando el dealer gana o el draw le deja con tenpai', () => {
    const outcomes: readonly { readonly outcome: HandOutcome; readonly renchan: boolean }[] = [
      { outcome: { type: 'dealerWin' }, renchan: true },
      { outcome: { type: 'dealerTenpaiDraw' }, renchan: true },
      { outcome: { type: 'otherWin' }, renchan: false },
      { outcome: { type: 'otherDraw' }, renchan: false },
    ]
    const failures: string[] = []

    for (const row of outcomes) {
      if (isRenchan(row.outcome) !== row.renchan) {
        failures.push(`${row.outcome.type}: isRenchan=${isRenchan(row.outcome)}`)
      }
    }

    expect(failures).toStrictEqual([])
  })
})

describe('T38 · renchan y prórroga', () => {
  it('tras renchan por victoria el dealer mantiene la localía y el honba vuelve a cero', () => {
    const first: HandState = { wind: 'east', dealer: 'west', honba: 1 }

    expect(nextHand(first, { type: 'dealerWin' })).toStrictEqual({
      wind: 'east',
      dealer: 'west',
      honba: 0,
    })
  })

  it('tras renchan por draw con tenpai el dealer mantiene la localía y el honba sube', () => {
    const first: HandState = { wind: 'east', dealer: 'west', honba: 2 }

    expect(nextHand(first, { type: 'dealerTenpaiDraw' })).toStrictEqual({
      wind: 'east',
      dealer: 'west',
      honba: 3,
    })
  })

  it('la prórroga solo se añade si el líder no llega a 30 000', () => {
    expect(needsExtension(29900)).toBe(true)
    expect(needsExtension(30000)).toBe(false)
    expect(needsExtension(30500)).toBe(false)
  })
})
