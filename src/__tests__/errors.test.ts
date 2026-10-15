import { describe, expect, it } from 'vitest'
import { DataError } from '@/data/errors'
import type { DataErrorCode } from '@/data/errors'

const CODES: readonly DataErrorCode[] = [
  'notFound',
  'notOpen',
  'finalizedGame',
  'duplicateNumber',
  'gapInSequence',
]

describe('DataError', () => {
  it('es un Error con código y mensaje de diagnóstico', () => {
    const error = new DataError('notFound')

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('notFound')
    expect(error.message.length).toBeGreaterThan(0)
  })

  it('conserva el mensaje de diagnóstico si se proporciona', () => {
    const error = new DataError('duplicateNumber', 'el turno 3 ya existe')

    expect(error.message).toBe('el turno 3 ya existe')
  })

  it.each(CODES)('acepta el código %s', (code) => {
    expect(new DataError(code).code).toBe(code)
  })
})
