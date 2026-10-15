import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type CollectionGroupUsage = {
  /** Identificador de la colección, el que se pasa a `collectionGroup(...)`. */
  readonly id: string
  /** Fichero del repositorio que la consulta, para exigirle su comentario de índice. */
  readonly repository: string
  /** Campos que el repositorio filtra con `where`, que el índice debe cubrir. */
  readonly whereFields: readonly string[]
}

/**
 * Colecciones que los repositorios de `dataDir` consultan por grupo, con los campos que filtran.
 *
 * Las dos consequences de usar `collectionGroup(...)` se comprueban contra esta lista, y ambas
 * hacen falta: las reglas deben cubrir el grupo con un comodín recursivo sobre el padre, y
 * `firestore.indexes.json` debe declarar su índice con alcance `COLLECTION_GROUP` —que Firestore no
 * crea solo, ni siquiera si tiene un solo campo—.
 */
export async function collectionGroupUsages(
  dataDir: string,
): Promise<readonly CollectionGroupUsage[]> {
  const usages: { id: string; repository: string; whereFields: readonly string[] }[] = []

  for (const entry of (await readdir(dataDir)).sort()) {
    if (!entry.endsWith('.repository.ts')) {
      continue
    }

    const source = await readFile(join(dataDir, entry), 'utf8')
    const ids = matches(source, /collectionGroup\([^,]+,\s*'([^']+)'\)/g)

    if (ids.length === 0) {
      continue
    }

    const whereFields = matches(source, /where\('([^']+)'/g)

    for (const id of ids) {
      usages.push({ id, repository: entry, whereFields })
    }
  }

  return usages
}

function matches(source: string, pattern: RegExp): readonly string[] {
  return [
    ...new Set([...source.matchAll(pattern)].map((match) => match[1]).filter(isPresent)),
  ].sort()
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined
}
