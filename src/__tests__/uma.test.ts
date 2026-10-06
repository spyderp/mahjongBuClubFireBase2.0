import { describe, expect, it } from 'vitest'
import { uma } from '@/domain/uma'
import { RETURN_POINT } from '@/domain/rules'
import type { Position } from '@/domain/types'

describe('T39 · uma y punto de retorno', () => {
  it('la uma aplica 30, +10, −10 y −30 a las cuatro posiciones, sin excepción', () => {
    const expected: Record<Position, number> = { '1st': 30, '2nd': 10, '3rd': -10, '4th': -30 }
    const failures: string[] = []

    for (const position of ['1st', '2nd', '3rd', '4th'] as const) {
      if (uma(position) !== expected[position]) {
        failures.push(`${position}: esperada ${expected[position]} y devuelta ${uma(position)}`)
      }
    }

    expect(failures).toStrictEqual([])
  })

  it('la suma de las cuatro umas es 0: el uma redistribuye, no crea puntos', () => {
    expect(uma('1st') + uma('2nd') + uma('3rd') + uma('4th')).toBe(0)
  })

  it('el punto de retorno está en 30 000', () => {
    expect(RETURN_POINT).toBe(30000)
  })
})
