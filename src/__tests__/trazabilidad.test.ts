import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La puerta de una especificación que no escribe en `domain/` —`plan.md` §1.1— es doble: el dominio
 * congelado y **un test por comportamiento de pantalla**. La primera mitad la mide `git diff`. La
 * segunda no tenía guardián: un RF podía quedarse sin test y la suite seguía verde, que es exactamente
 * lo que pasó con RF-26 —implementado en `GameDetailPage.vue`, marcado `[x]` en `tasks.md` y sin una
 * sola aserción—.
 *
 * Este test cierra ese hueco: lee la lista de RF de la especificación desde el disco, busca cada
 * identificador en los ficheros de test, y **falla enumerando los RF que ningún test cita**. Un RF
 * nuevo sin test deja de ser un olvido silencioso y pasa a ser un rojo que nombra al culpable.
 *
 * El patrón es el mismo que `locales.test.ts` y `handValue.test.ts`: el documento del repositorio se
 * comprueba contra lo que hay, no contra una copia.
 */

const SPEC = join(import.meta.dirname, '..', '..', 'specs', '003', 'spec.md')

const TESTS_DIR = import.meta.dirname

/**
 * Los RF cuya comprobación es una **revisión visual** acordada, no un test automatizado. Van aquí con
 * su motivo, no en una lista anónima: la puerta de 003 admite este camino, pero obliga a escribirlo.
 *
 * - **RF-26.1, RF-26.2.** El club dio fe de la diferencia de puntos tras revisar el detalle a mano: al
 *   hacer clic en un jugador se ve su diferencia contra cada rival, y con marcadores iguales el cero se
 *   pinta como `0` y no como celda vacía. No se automatiza por decisión del club (2026-10-20), así que
 *   queda declarado en vez de fingir que hay un test.
 */
const VISUAL_REVIEW: Readonly<Record<string, string>> = {
  'RF-26.1': 'revisión visual del club (2026-10-20)',
  'RF-26.2': 'revisión visual del club (2026-10-20)',
}

/** Los identificadores `RF-xx.y` que la especificación declara, en orden y sin repetir. */
function requirementIds(spec: string): string[] {
  const ids = spec.match(/^- \*\*(RF-\d+\.\d+)\*\*/gm) ?? []

  return [...new Set(ids.map((line) => line.replace(/^\- \*\*|\*\*$/g, '')))]
}

/**
 * Todo el texto de test del proyecto, en un solo bloque: un RF citado en cualquier fichero cuenta.
 *
 * Este propio fichero **se excluye**: nombra todos los RF por definición —y sobre todo los que declara
 * como revisión visual—, así que contarlo como evidencia haría que un RF sin test se validara a sí
 * mismo. Es el error que este guardián existe para atrapar, y no puede cometerlo él.
 */
async function allTestSources(): Promise<string> {
  const names = await readdir(TESTS_DIR)
  const sources = await Promise.all(
    names
      .filter((name) => name.endsWith('.test.ts') && name !== 'trazabilidad.test.ts')
      .map((name) => readFile(join(TESTS_DIR, name), 'utf8')),
  )

  return sources.join('\n')
}

describe('trazabilidad · cada RF de specs/003 tiene test', () => {
  it('la especificación declara los 25 RF de RF-24 a RF-30', async () => {
    const ids = requirementIds(await readFile(SPEC, 'utf8'))

    expect(ids).toHaveLength(25)
    expect(ids[0]).toBe('RF-24.1')
    expect(ids.at(-1)).toBe('RF-30.6')
  })

  it('ningún RF se queda sin test ni sin declarar su revisión visual', async () => {
    const ids = requirementIds(await readFile(SPEC, 'utf8'))
    const sources = await allTestSources()

    const sinCobertura = ids.filter(
      (id) => !sources.includes(id) && VISUAL_REVIEW[id] === undefined,
    )

    /**
     * El mensaje enumera los que faltan: quien añada un RF sin test ve el identificador exacto, no un
     * «faltan tests» genérico que obliga a buscarlo a mano.
     */
    expect(
      sinCobertura,
      `RF sin test ni revisión declarada: ${sinCobertura.join(', ')}`,
    ).toStrictEqual([])
  })

  it('una revisión visual no se declara dos veces para el mismo motivo sin test', async () => {
    const ids = requirementIds(await readFile(SPEC, 'utf8'))
    const sources = await allTestSources()

    for (const [id, motivo] of Object.entries(VISUAL_REVIEW)) {
      expect(ids, `«${id}» está declarado como revisión pero la spec no lo declara`).toContain(id)
      expect(motivo.trim().length, `«${id}» no explica por qué se revisa a mano`).toBeGreaterThan(0)
      /**
       * Si algún día se le escribe un test, la entrada sobra: dejarla haría que el mapa mintiera
       * sobre un RF que ya está cubierto. Este test lo detecta y pide retirarla.
       */
      expect(sources.includes(id), `«${id}» ya tiene test: retíralo de VISUAL_REVIEW`).toBe(false)
    }
  })
})
