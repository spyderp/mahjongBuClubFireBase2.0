import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectionGroupUsages } from '@/test-utils/firestoreQueries'

const ROOT = join(import.meta.dirname, '..', '..')
const INDEXES_PATH = join(ROOT, 'firestore.indexes.json')

/**
 * Índices compuestos que exigen **las consultas que existen hoy** en `src/data/*.repository.ts`.
 *
 * Firestore crea solo los índices de un solo campo. En cuanto una consulta mezcla un filtro de
 * igualdad con un `orderBy` sobre otro campo, hace falta un índice compuesto, y si no está
 * desplegado la consulta falla con `failed-precondition` sin devolver filas: es lo que hace que
 * una lista con datos aparezca como vacía.
 */
const REQUIRED: readonly {
  readonly collection: string
  readonly fields: readonly string[]
  readonly usedBy: string
  readonly because: string
}[] = [
  {
    collection: 'games',
    fields: ['status ASCENDING', 'updatedAt DESCENDING'],
    usedBy: 'src/data/games.repository.ts',
    because: 'listOpen(): where status == open + orderBy updatedAt desc (RF-10.4)',
  },
  {
    collection: 'games',
    fields: ['seasonId ASCENDING', 'date DESCENDING'],
    usedBy: 'src/data/games.repository.ts',
    because: 'listBySeason(): where seasonId == + orderBy date desc (RF-12.5)',
  },
  {
    collection: 'seasons',
    fields: ['dateFrom ASCENDING', 'dateTo ASCENDING'],
    usedBy: 'src/data/seasons.repository.ts',
    because: 'findOverlapping() y findByDateRange(): rangos de fecha (RF-11.2, RF-11.5)',
  },
]

type IndexFile = {
  readonly indexes?: readonly {
    readonly collectionGroup?: string
    readonly queryScope?: string
    readonly fields?: readonly { readonly fieldPath?: string; readonly order?: string }[]
  }[]
}

describe('T1 · firestore.indexes.json', () => {
  it('firebase.json declara el fichero de índices junto a las reglas', async () => {
    const config = JSON.parse(await readFile(join(ROOT, 'firebase.json'), 'utf8')) as {
      firestore?: { rules?: string; indexes?: string }
    }

    expect(config.firestore?.rules).toBe('firestore.rules')
    expect(config.firestore?.indexes).toBe('firestore.indexes.json')
  })

  it('contiene exactamente los índices compuestos que exigen las consultas', async () => {
    expect(await declaredCollectionIndexes()).toEqual(
      REQUIRED.map((entry) => `${entry.collection}(${entry.fields.join(', ')})`),
    )
  })

  /**
   * T106 · RF-12.5: los índices automáticos de Firestore son de alcance `COLLECTION`. Una consulta
   * por grupo de colección necesita el suyo con alcance `COLLECTION_GROUP` y hay que declararlo,
   * **aunque tenga un solo campo**: sin él la consulta falla con `failed-precondition`.
   */
  it('cada colección consultada en grupo declara su índice de alcance COLLECTION_GROUP (T106)', async () => {
    const usages = await collectionGroupUsages(join(ROOT, 'src', 'data'))
    const indexes = (await indexFile()).indexes ?? []

    expect(usages.length).toBeGreaterThan(0)

    for (const usage of usages) {
      const declared = indexes.find(
        (index) => index.collectionGroup === usage.id && index.queryScope === 'COLLECTION_GROUP',
      )

      if (declared === undefined) {
        throw new Error(
          `collectionGroup('${usage.id}') se consulta en ${usage.repository} pero no hay índice ` +
            `de alcance COLLECTION_GROUP para el grupo «${usage.id}»: la consulta se denegaría`,
        )
      }

      const paths = (declared.fields ?? []).map((field) => field.fieldPath)
      for (const field of usage.whereFields) {
        expect(paths).toContain(field)
      }
    }
  })

  /**
   * `AGENT.md` pide que cada índice requerido se documente con un comentario en el repositorio que
   * lo necesita. El de grupo de colección también, que es el que más fácil se olvida.
   */
  it('el repositorio que consulta un grupo documenta su índice (T106)', async () => {
    for (const usage of await collectionGroupUsages(join(ROOT, 'src', 'data'))) {
      const source = await readFile(join(ROOT, 'src', 'data', usage.repository), 'utf8')

      expect(source).toMatch(/[ÍI]ndice de grupo de colecci[óo]n[^\n]*`?COLLECTION_GROUP`?/)
      for (const field of usage.whereFields) {
        expect(source).toContain(field)
      }
    }
  })

  it('no declara índices de un solo campo con alcance COLLECTION: Firestore los crea solo', async () => {
    const file = await indexFile()

    for (const index of collectionScoped(file)) {
      expect((index.fields ?? []).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('cada índice de colección está en el alcance COLLECTION y ordenado', async () => {
    const file = await indexFile()

    for (const index of collectionScoped(file)) {
      expect(index.queryScope).toBe('COLLECTION')
      expect(index.collectionGroup).toBeDefined()
      expect((index.fields ?? []).every((field) => field.order !== undefined)).toBe(true)
    }
  })

  /**
   * El hueco que dejó esta impasse: los comentarios de «índice compuesto» ya estaban en los
   * repositorios, pero nadie creó el fichero que los materializa. Si una consulta exige un índice y
   * su repositorio no lo documenta, el próximo `listOpen()` vuelve a fallar en silencio.
   */
  it('cada consulta que lo exige lleva su comentario de índice compuesto en el repositorio', async () => {
    for (const entry of REQUIRED) {
      // Se busca en el fuente **con** comentarios: lo que se documenta es precisamente el índice.
      const source = await readFile(join(ROOT, entry.usedBy), 'utf8')
      const signature = entry.fields.map((field) => field.split(' ')[0]).join(' ASC, ')
      const collection = entry.collection

      expect(source).toMatch(new RegExp(`[ÍI]ndice compuesto:\\s*${collection}\\s*\\(${signature}`))
    }
  })

  /**
   * El desajuste clásico: `firebase deploy` publica reglas e índices en el proyecto que dice
   * `.firebaserc`, y la aplicación lee del que dice `VITE_FIREBASE_PROJECT_ID`. Si no coinciden,
   * se despliega todo y la app sigue hablando con otro sitio, sin ningún aviso.
   */
  it.skipIf(!existsSync(join(ROOT, '.env')))(
    '.firebaserc apunta al mismo proyecto que lee la aplicación',
    async () => {
      const rc = JSON.parse(await readFile(join(ROOT, '.firebaserc'), 'utf8')) as {
        projects?: { default?: string }
      }

      expect(rc.projects?.default).toBe(await projectIdFromEnv())
    },
  )
})

async function projectIdFromEnv(): Promise<string | null> {
  const env = await readFile(join(ROOT, '.env'), 'utf8')
  const line = env
    .split('\n')
    .find((candidate) => candidate.startsWith('VITE_FIREBASE_PROJECT_ID='))

  return line?.split('=')[1]?.trim() ?? null
}

async function indexFile(): Promise<IndexFile> {
  return JSON.parse(await readFile(INDEXES_PATH, 'utf8')) as IndexFile
}

/** Firma de cada índice declarado, en el mismo formato que `REQUIRED`. */
async function declaredCollectionIndexes(): Promise<readonly string[]> {
  const file = await indexFile()

  return collectionScoped(file).map(
    (index) =>
      `${String(index.collectionGroup)}(${(index.fields ?? [])
        .map((field) => `${String(field.fieldPath)} ${String(field.order)}`)
        .join(', ')})`,
  )
}

/** Los de alcance `COLLECTION`: los compuestos que se declaran a mano. Los de grupo, aparte. */
function collectionScoped(file: IndexFile): readonly NonNullable<IndexFile['indexes']>[number][] {
  return (file.indexes ?? []).filter((index) => index.queryScope === 'COLLECTION')
}
