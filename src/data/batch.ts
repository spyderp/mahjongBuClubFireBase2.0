import { writeBatch } from 'firebase/firestore'
import type { Firestore, WriteBatch } from 'firebase/firestore'
import { getDb } from '@/app/firebase'

/** RF-9.5: crea el `WriteBatch` que comparten todas las mutaciones de un solo cambio. */
export function createBatch(db: Firestore = getDb()): WriteBatch {
  return writeBatch(db)
}

/**
 * RF-9.5: envoltorio común de las escrituras. Las funciones de repositorio aceptan un
 * `batch?: WriteBatch` opcional; con `undefined` crean el suyo y lo confirman al terminar,
 * con el batch ajeno solo encolan y deja la confirmación a quien lo posee. Las lecturas de
 * guarda ocurren antes de encolar escrituras, así un batch compartido nunca se envenena con
 * una operación que depende de una escritura aún sin confirmar.
 */
export async function withBatch<T>(
  batch: WriteBatch | undefined,
  queue: (current: WriteBatch) => Promise<T> | T,
): Promise<T> {
  if (batch === undefined) {
    const own = createBatch()
    const result = await queue(own)
    await own.commit()

    return result
  }

  return queue(batch)
}
