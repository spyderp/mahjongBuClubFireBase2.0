import { describe, expect, it } from 'vitest'
import {
  EXTERNAL_ID_MAX_LENGTH,
  EXTERNAL_ID_MIN_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
  toGameId,
  toPlayerId,
  toSeasonId,
  validateExternalId,
  validatePlayerName,
} from '@/domain/types'

describe('validatePlayerName', () => {
  it('acepta un nombre válido y lo devuelve recortado', () => {
    const resultado = validatePlayerName('  Satoshi  ')

    expect(resultado).toStrictEqual({ ok: true, name: 'Satoshi' })
  })

  it('acepta un nombre de exactamente 100 caracteres', () => {
    const nombre = 'a'.repeat(PLAYER_NAME_MAX_LENGTH)

    expect(validatePlayerName(nombre)).toStrictEqual({ ok: true, name: nombre })
  })

  it('acepta acentos, apóstrofos y guiones', () => {
    expect(validatePlayerName("  Mª José O'Neill-Smith ")).toStrictEqual({
      ok: true,
      name: "Mª José O'Neill-Smith",
    })
  })

  it('rechaza un nombre vacío', () => {
    expect(validatePlayerName('')).toStrictEqual({ ok: false, reason: 'empty' })
  })

  it('rechaza un nombre que solo tiene espacios', () => {
    expect(validatePlayerName('   \t\n ')).toStrictEqual({ ok: false, reason: 'empty' })
  })

  it('rechaza un nombre de más de 100 caracteres diciendo cuál es la razón', () => {
    const resultado = validatePlayerName('a'.repeat(PLAYER_NAME_MAX_LENGTH + 1))

    expect(resultado).toStrictEqual({ ok: false, reason: 'tooLong' })
  })

  it('mide la longitud después de recortar, no antes', () => {
    const conEspacios = `  ${'a'.repeat(PLAYER_NAME_MAX_LENGTH)}  `

    expect(validatePlayerName(conEspacios).ok).toBe(true)
  })
})

describe('validateExternalId', () => {
  it('acepta el formato de código corto y lo normaliza a minúsculas', () => {
    expect(validateExternalId('  SOC-001 ')).toStrictEqual({ ok: true, externalId: 'soc-001' })
  })

  it('acepta el formato de alias y lo normaliza a minúsculas', () => {
    expect(validateExternalId('Satoshi_01')).toStrictEqual({ ok: true, externalId: 'satoshi_01' })
  })

  it('acepta un identificador de longitud mínima', () => {
    expect(validateExternalId('a1')).toStrictEqual({ ok: true, externalId: 'a1' })
  })

  it('acepta un identificador de longitud máxima', () => {
    const id = 'a'.repeat(EXTERNAL_ID_MAX_LENGTH)

    expect(validateExternalId(id)).toStrictEqual({ ok: true, externalId: id })
  })

  it('rechaza un identificador vacío', () => {
    expect(validateExternalId('   ')).toStrictEqual({ ok: false, reason: 'empty' })
  })

  it('rechaza un identificador de un solo carácter', () => {
    expect(validateExternalId('a')).toStrictEqual({ ok: false, reason: 'tooShort' })
  })

  it('rechaza un identificador demasiado largo', () => {
    const id = 'a'.repeat(EXTERNAL_ID_MAX_LENGTH + 1)

    expect(validateExternalId(id)).toStrictEqual({ ok: false, reason: 'tooLong' })
  })

  it('rechaza un identificador con espacios dentro', () => {
    expect(validateExternalId('soc 001')).toStrictEqual({
      ok: false,
      reason: 'invalidCharacters',
    })
  })

  it('rechaza un identificador con un guion inicial', () => {
    expect(validateExternalId('-soc')).toStrictEqual({
      ok: false,
      reason: 'invalidCharacters',
    })
  })

  it('rechaza un identificador con guion o guion bajo en los bordes', () => {
    expect(validateExternalId('soc-')).toStrictEqual({
      ok: false,
      reason: 'invalidCharacters',
    })
    expect(validateExternalId('_soc')).toStrictEqual({
      ok: false,
      reason: 'invalidCharacters',
    })
    expect(validateExternalId('soc_')).toStrictEqual({
      ok: false,
      reason: 'invalidCharacters',
    })
  })

  it('acepta el guion y el guion bajo en el interior de un alias', () => {
    expect(validateExternalId('soc-01_x')).toStrictEqual({ ok: true, externalId: 'soc-01_x' })
  })

  it('el formato de codigo no admite guiones y el de alias si', () => {
    expect(validateExternalId('soc001').ok).toBe(true)
    expect(validateExternalId('soc-001-x').ok).toBe(true)
  })

  it('rechaza un identificador con símbolos', () => {
    expect(validateExternalId('soc.001')).toStrictEqual({
      ok: false,
      reason: 'invalidCharacters',
    })
  })

  it('trata como el mismo identificador dos escrituras que solo difieren en mayúsculas', () => {
    const alto = validateExternalId('SOC-001')
    const bajo = validateExternalId('soc-001')

    expect(alto.ok && bajo.ok && alto.externalId === bajo.externalId).toBe(true)
  })

  it('expone los limites que usa', () => {
    expect(EXTERNAL_ID_MIN_LENGTH).toBe(2)
    expect(EXTERNAL_ID_MAX_LENGTH).toBe(32)
  })
})

describe('alias de marca para identificadores', () => {
  it('acepta un identificador de jugador no vacío', () => {
    expect(toPlayerId('p1')).toBe('p1')
  })

  it('acepta identificadores que empiezan por espacios si no son solo espacios', () => {
    expect(toSeasonId(' s1 ')).toBe('s1')
  })

  it('acepta un identificador de partida', () => {
    expect(toGameId('g1')).toBe('g1')
  })

  it('rechaza un identificador vacío', () => {
    expect(() => toPlayerId('   ')).toThrow(TypeError)
  })

  it('rechaza un SeasonId vacío', () => {
    expect(() => toSeasonId('')).toThrow(TypeError)
  })

  it('rechaza un GameId vacío', () => {
    expect(() => toGameId('\t\n')).toThrow(TypeError)
  })
})
