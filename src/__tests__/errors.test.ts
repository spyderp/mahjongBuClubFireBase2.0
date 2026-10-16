import { describe, expect, it } from 'vitest'
import { DataError } from '@/data/errors'
import type { DataErrorCode } from '@/data/errors'

/**
 * Los diez códigos de `DataErrorCode`. La lista es exhaustiva a propósito: `messageOf` es un
 * `switch` sin `default`, así que un código que se añadiera aquí y no estuviera en el `switch`
 * devolvería `undefined` en vez de fallar el typecheck, y este test es lo que lo caza.
 */
const CODES: readonly DataErrorCode[] = [
  'notFound',
  'notOpen',
  'finalizedGame',
  'duplicateNumber',
  'gapInSequence',
  'conflict',
  'auditFull',
  'staleLocal',
  'suufonRejected',
  'replayInvalid',
  'gameMarked',
  'notLastTurn',
]

/** Los siete códigos que `specs/002` añade: RF-19.12, RF-19.14, RF-19.15, RF-21.5, RF-18.16 y RF-18.18. */
const NEW_CODES: readonly DataErrorCode[] = [
  'conflict',
  'auditFull',
  'staleLocal',
  'suufonRejected',
  'replayInvalid',
  'gameMarked',
  'notLastTurn',
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

  /**
   * T22: los cuatro rechazos nuevos tienen que existir **y** tener mensaje propio. Un código sin
   * mensaje no falla al construirse —`super(undefined)` deja el `message` vacío— y el aviso que ve
   * quien está en la mesa se pierde en la traducción.
   */
  it('los códigos de specs/002 tienen su propio mensaje', () => {
    for (const code of NEW_CODES) {
      const message = new DataError(code).message

      expect(message, `sin mensaje: ${code}`).not.toBe('')
      expect(message.length, `mensaje vacío: ${code}`).toBeGreaterThan(10)
    }
  })

  it('ningún código comparte mensaje con otro, para que la clave i18n sea unívoca', () => {
    const messages = CODES.map((code) => new DataError(code).message)

    expect(new Set(messages).size).toBe(CODES.length)
  })

  it('un mensaje a medida no se confunde con el del código', () => {
    const generic = new DataError('auditFull').message
    const specific = new DataError('auditFull', 'El registro del turno 5 ha alcanzado su límite')

    expect(specific.message).toContain('turno 5')
    expect(specific.message).not.toBe(generic)
  })

  /**
   * T33: `replayInvalid` tiene que poder decir **qué turno** invalida la operación, y la
   * traducción sale de i18n por código (AGENT.md → Errores). El `message` es solo diagnóstico, así
   * que el número del turno viaja en `details` y no dentro del texto.
   */
  it('los detalles viajan aparte del mensaje de diagnóstico (T33)', () => {
    const error = new DataError('replayInvalid', 'El turno 7 no se puede recalcular', {
      turn: '7',
    })

    expect(error.details).toStrictEqual({ turn: '7' })
    expect(error.message).toContain('7')
  })

  it('sin detalles, details es un objeto vacío y no undefined', () => {
    expect(new DataError('notFound').details).toStrictEqual({})
  })
})
