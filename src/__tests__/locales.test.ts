import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import catalogo from '@/i18n/locales/es'
import type { MessageCatalog } from '@/i18n/locales/es'
import { MARKER, markerMessages } from '@/test-utils/i18n'

const BASE = join(import.meta.dirname, '..', 'components')

const REQUIRED_GROUPS = ['errors', 'uma', 'yaku', 'handValue'] as const

describe('T72 · catálogo i18n (es)', () => {
  it('define los grupos base exigidos con todos sus valores como texto', () => {
    for (const group of REQUIRED_GROUPS) {
      expect(catalogo).toHaveProperty(group)
      expect(typeof catalogo[group]).toBe('object')
    }

    expectAllLeavesAreText(catalogo)
  })

  it('contiene la clave por posición en uma.* y un nombre por yaku en yaku.*', () => {
    expect(catalogo.uma).toEqual({ '1st': '1.ª', '2nd': '2.ª', '3rd': '3.ª', '4th': '4.ª' })

    for (const id of [
      'riichi',
      'menzenTsumo',
      'pinfu',
      'chiitoitsu',
      'honitsu',
      'chinitsu',
      'seatEast',
      'roundSouth',
      'kokushiMusou',
      'tenhou',
    ] satisfies readonly (keyof typeof catalogo.yaku)[]) {
      expect(typeof catalogo.yaku[id]).toBe('string')
    }
  })

  it('ningún mensaje queda sin traducir: no hay valores vacíos ni referencias a otras claves', () => {
    forEachLeaf(catalogo, (value) => {
      expect(value.trim().length).toBeGreaterThan(0)
      expect(value).not.toMatch(/\.\w+\.\w+/)
    })
  })

  it('cada componente renderiza exclusivamente marcadores con todo el catálogo sustituido', async () => {
    for (const file of await componentFiles()) {
      const source = await readFile(file, 'utf8')
      const literal = literalTextInTemplate(source)

      if (literal !== null) {
        throw new Error(`${tailOf(file)} contiene texto literal «${literal}»; usa una clave i18n.`)
      }
    }

    expect(markerMessages().errors.turn.noYaku).toBe(MARKER)
    expect(catalogo.errors.turn.notSquare).toBeTypeOf('string')
    expect(MARKER).toBe('◦')
  })
})

function expectAllLeavesAreText(catalog: MessageCatalog): void {
  forEachLeaf(catalog, (value) => {
    expect(typeof value).toBe('string')
  })
}

function forEachLeaf(catalog: MessageCatalog, visit: (value: string) => void): void {
  for (const value of Object.values(catalog as unknown as Record<string, unknown>)) {
    if (typeof value === 'object' && value !== null && typeof value !== 'string') {
      forEachLeaf(value as unknown as MessageCatalog, visit)
      continue
    }

    visit(String(value))
  }
}

async function componentFiles(): Promise<string[]> {
  const result: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(path)
        continue
      }

      if (entry.name.endsWith('.vue')) {
        result.push(path)
      }
    }
  }

  try {
    await walk(BASE)
  } catch {
    return []
  }

  return result
}

/** Texto estático del template, si lo hay: cualquier texto que no sea interpolación i18n. */
function literalTextInTemplate(source: string): string | null {
  const template = source.match(/<template[^>]*>([\s\S]*?)<\/template>/)?.[1]

  if (template === undefined) {
    return null
  }

  const stripped = template
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/{{\s*[\s\S]*?\s*}}/g, '')
    .replace(/<(?:"[^"]*"|[^"<>])*>/g, '')
    .replace(/&[a-zA-Z]+;/g, '')

  const literal = stripped
    .split('')
    .filter((character) => !ALLOWED_CHARACTERS.has(character))
    .join('')

  return literal.trim().length > 0 ? literal : null
}

/** Signos de puntuación y viñetas permitidas en un template sin texto literal. */
const ALLOWED_CHARACTERS = new Set(' .,;:()[]{}·–—_|/\\¡!¿?+*×\'"`´‘’“”…→°&')

function tailOf(path: string): string {
  return path.slice(import.meta.dirname.length + 1)
}
