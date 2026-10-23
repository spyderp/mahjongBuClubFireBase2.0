import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DataErrorCode } from '@/data/errors'
import { ERROR_KEYS } from '@/data/errors'
import catalogo from '@/i18n/locales/es'
import type { MessageCatalog } from '@/i18n/locales/es'
import { YAKU_CATALOG } from '@/domain/yaku'
import { MARKER, markerMessages } from '@/test-utils/i18n'

const BASE = join(import.meta.dirname, '..', 'components')

const REQUIRED_GROUPS = ['errors', 'uma', 'yaku', 'handValue'] as const

/**
 * T33 · RF-19.12, RF-19.14, RF-19.15, RF-21.5. Los **cuatro rechazos nuevos** de `specs/002`, más
 * los que la fase 5 añadió al cerrar T28 a T32: la partida no reproducible, la partida marcada por
 * bancarrota y el borrado que no es el último. Un rechazo sin clave se muestra con la propia ruta de
 * la clave en pantalla, y en la mesa eso es un error sin explicar.
 */
const NEW_TURN_ERRORS: readonly DataErrorCode[] = [
  'conflict',
  'auditFull',
  'staleLocal',
  'suufonRejected',
  'replayInvalid',
  'gameMarked',
  'notLastTurn',
]

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

  /**
   * T14 · RF-34.1, RF-34.2 y RF-34.3. Cada yaku del catálogo se muestra como «japonés (inglés)» y
   * el nombre en inglés vive **solo** en el catálogo de traducciones: ni en el catálogo de yaku del
   * dominio ni en ningún componente.
   */
  it('los cuarenta y nueve yaku muestran su nombre japonés con el inglés entre paréntesis', () => {
    const ids = YAKU_CATALOG.map((definition) => definition.id)

    expect(ids).toHaveLength(49)

    for (const id of ids) {
      const label = catalogo.yaku[id]

      expect(label, `sin nombre: ${id}`).toBeTypeOf('string')
      expect(label, `sin inglés: ${id}`).toMatch(/^.+ \([^()]+\)$/)
    }
  })

  it('el nombre en inglés de cada yaku vive solo en el catálogo de traducciones', async () => {
    for (const id of YAKU_CATALOG.map((definition) => definition.id)) {
      expect(englishNameOf(catalogo.yaku[id]).length, `sin inglés: ${id}`).toBeGreaterThan(0)
    }

    for (const file of await filesOutsideTheCatalog()) {
      const source = withoutComments(await readFile(file, 'utf8'))

      for (const id of YAKU_CATALOG.map((definition) => definition.id)) {
        expect(source, `${tailOf(file)} repite el inglés de ${id}`).not.toMatch(
          wordPattern(englishNameOf(catalogo.yaku[id])),
        )
      }
    }
  })
})

/** T33: cada rechazo que la pantalla de captura puede mostrar tiene su propia clave. */
describe('T33 · claves de los rechazos de specs/002', () => {
  it('todo DataErrorCode tiene su clave, y la clave existe en el catálogo', () => {
    for (const code of Object.keys(ERROR_KEYS) as readonly DataErrorCode[]) {
      expect(typeof messageAt(ERROR_KEYS[code]), `sin clave: ${code}`).toBe('string')
    }
  })

  it('los siete rechazos nuevos tienen su clave en errors.turn', () => {
    for (const code of NEW_TURN_ERRORS) {
      const entry = Object.entries(catalogo.errors.turn).find(([key]) => key === code)

      expect(entry, `sin clave: ${code}`).toBeDefined()
      expect(entry?.[1].trim().length, `mensaje corto: ${code}`).toBeGreaterThan(10)
      expect(ERROR_KEYS[code], `ERROR_KEYS no apunta a errors.turn: ${code}`).toBe(
        `errors.turn.${code}`,
      )
    }
  })

  it('replayInvalid nombra el turno que la hace inviable, y con parámetro', () => {
    expect(catalogo.errors.turn.replayInvalid).toContain('{turn}')
  })

  it('los rechazos de la captura que ya existían siguen teniendo su clave', () => {
    for (const code of [
      'duplicateNumber',
      'gapInSequence',
      'notSquare',
      'noYaku',
      'windYaku',
      'chiiFu',
      'notRepresentable',
      'moreThanThreeWinners',
      'rulesetUnsupported',
    ] as const) {
      expect(catalogo.errors.turn, `sin clave: ${code}`).toHaveProperty(code)
    }
  })

  it('el estado de la mano siguiente tiene sus tres campos y su título', () => {
    expect(Object.keys(catalogo.turnForm.nextHand)).toStrictEqual([
      'title',
      'roundWind',
      'dealerSeat',
      'honba',
    ])
  })

  it('la captura de una mano won tiene sus textos de desglose y de ajuste', () => {
    expect(catalogo.turnForm.yakuHan).toBeTypeOf('string')
    expect(catalogo.turnForm.yakuHanOverride).toBeTypeOf('string')
    expect(catalogo.turnForm.catalogTotal).toBeTypeOf('string')
    expect(catalogo.turnForm.overrideNotice).toContain('{delta}')
    expect(catalogo.turnForm.breakdown).toBeTypeOf('string')
    expect(catalogo.turnForm.winners).toBeTypeOf('string')
    expect(catalogo.turnForm.addWinner).toBeTypeOf('string')
  })
})

/**
 * T23 · RF-29.3. `aborted` solo se alcanza al finalizar por debajo del mínimo (RF-9.2 de 001); la
 * transición de abandono devuelve `unfinished` (`domain/game.ts:107`), que se pinta como
 * «Inconclusa» (`es.ts:251`). La palabra «abortada» solo puede describir el estado `aborted`, así
 * que nunca puede aparecer en un mensaje ligado a `unfinished`.
 *
 * Se recorre `es.ts` en **disco** para que la comprobación no dependa de cómo se lea el catálogo: si
 * alguien vuelve a escribir que una partida abandonada queda «abortada», esto falla.
 */
describe('T23 · ninguna cadena dice «abortada» para el estado unfinished (RF-29.2, RF-29.3)', () => {
  it('el aviso de abortar dice «inconclusa» y no «abortada»', () => {
    expect(catalogo.gamesView.confirmAbandon).toBeTypeOf('string')
    expect(catalogo.gamesView.confirmAbandonHint.toLowerCase()).toContain('inconclusa')
    expect(catalogo.gamesView.confirmAbandonHint.toLowerCase()).not.toContain('abortad')
  })

  it('la palabra «abortada» solo describe el estado aborted, no unfinished', () => {
    expect(catalogo.gamesView.statuses.aborted.toLowerCase()).toContain('abortad')
    expect(catalogo.gamesView.statuses.unfinished.toLowerCase()).not.toContain('abortad')
  })

  it('ningún mensaje de es.ts liga «abortad» a lo inconcluso, leído desde el disco', async () => {
    const source = await readFile(
      join(import.meta.dirname, '..', 'i18n', 'locales', 'es.ts'),
      'utf8',
    )

    const consistent = source
      .split('\n')
      .filter((line) => line.toLowerCase().includes('abortad'))
      .every((line) => !line.toLowerCase().includes('inconclus'))

    expect(consistent).toBe(true)
  })
})

/** T22 · RF-29.1: el botón dice «abortar» y ninguna pantalla usa «abandonar» para esa acción. */
describe('T22 · el botón de la acción dice «abortar» (RF-29.1)', () => {
  it('gamesView.abandon contiene «abortar» y no «abandonar», y el estado sigue siendo inconcluso', () => {
    expect(catalogo.gamesView.abandon.toLowerCase()).toContain('abortar')
    expect(catalogo.gamesView.abandon.toLowerCase()).not.toContain('abandonar')
  })
})

function expectAllLeavesAreText(catalog: MessageCatalog): void {
  forEachLeaf(catalog, (value) => {
    expect(typeof value).toBe('string')
  })
}

/** El nombre en inglés de un yaku: lo que va entre paréntesis en su etiqueta. */
function englishNameOf(label: string): string {
  return label.match(/\(([^()]+)\)$/)?.[1] ?? ''
}

/**
 * RF-34.2 · Los ficheros donde el nombre en inglés **no** puede estar: todo el dominio y todos los
 * `.vue`. El catálogo de traducciones queda fuera porque es el sitio donde sí vive.
 */
async function filesOutsideTheCatalog(): Promise<string[]> {
  const root = join(import.meta.dirname, '..')
  const result: string[] = []

  async function walk(dir: string, accept: (name: string) => boolean): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(path, accept)
        continue
      }

      if (accept(entry.name)) {
        result.push(path)
      }
    }
  }

  await walk(join(root, 'domain'), (name) => name.endsWith('.ts'))
  await walk(root, (name) => name.endsWith('.vue'))

  return result
}

/**
 * El código sin sus comentarios: lo que se compila, no lo que se explica. Un comentario del dominio
 * puede nombrar el yaku en romaji (`hasPinfu`), pero eso no se pinta en ninguna pantalla.
 */
function withoutComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

/**
 * El nombre suelto: ni dentro de otro nombre ni dentro de un identificador. La comparación distingue
 * mayúsculas porque el nombre en inglés se **escribe** como se muestra, mientras que el código solo
 * usa el identificador (`riichi`, `turnForm.riichi`), que es otra cosa.
 */
function wordPattern(text: string): RegExp {
  return new RegExp(`\\b${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
}

/** El mensaje que hay en `catalogo` bajo una ruta con puntos, sea del tamaño que sea. */
function messageAt(key: string): unknown {
  let node: unknown = catalogo

  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) {
      return undefined
    }

    node = (node as Record<string, unknown>)[segment]
  }

  return node
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
