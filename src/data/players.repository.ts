import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot, WriteBatch } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { withBatch } from '@/data/batch'
import { DataError } from '@/data/errors'
import type { Player, PlayerId, Timestamp as DomainTimestamp } from '@/domain/types'

export type PlayerRecord = { readonly id: PlayerId } & Player

export type CreatePlayerInput = {
  readonly externalId: string
  readonly name: string
  /** RF-1.3: `true` cuando el alta nace de capturar un identificador desconocido. */
  readonly guest?: boolean
}

export type UpdatePlayerInput = {
  readonly externalId?: string
  readonly name?: string
  readonly active?: boolean
  /** RF-1.5: promover a jugador del club es pasar `guest` a `false` sin cambiar de `id`. */
  readonly guest?: boolean
}

type PlayerData = {
  readonly externalId: string
  readonly name: string
  readonly active: boolean
  readonly guest?: boolean
  readonly createdAt: DomainTimestamp
  readonly updatedAt: DomainTimestamp
}

/**
 * RF-1.1 a RF-1.7 y RF-0.7: CRUD básico de jugadores. El documento guarda `active`, la marca de
 * invitado (RF-1.3) y los dos sellos de tiempo, y **nada más**: los contadores derivados son
 * lectura, no escritura (AGENT.md → Data model), así que `create` no puede borrarlos ni
 * iniciarlos en falso.
 */
export const playersRepository = {
  async list(): Promise<PlayerRecord[]> {
    return listAll()
  },

  /** RF-1.3: el listado del club excluye a los invitados; ellos no pertenecen al club. */
  async listClub(): Promise<PlayerRecord[]> {
    return (await listAll()).filter((player) => !player.guest)
  },

  async findByExternalId(externalId: string): Promise<PlayerRecord | null> {
    const snap = await getDocs(
      query(collection(getDb(), 'players'), where('externalId', '==', externalId)),
    )
    const first = snap.docs[0]

    return first === undefined ? null : toRecord(first)
  },

  create(input: CreatePlayerInput, batch?: WriteBatch): Promise<PlayerRecord> {
    return withBatch(batch, (current) => {
      const ref = doc(collection(getDb(), 'players'))
      const now = Timestamp.now()
      const guest = input.guest ?? false

      current.set(ref, {
        externalId: input.externalId,
        name: input.name,
        active: true,
        guest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      return toRecordFrom(ref.id, {
        externalId: input.externalId,
        name: input.name,
        active: true,
        guest,
        createdAt: now,
        updatedAt: now,
      })
    })
  },

  update(id: PlayerId, patch: UpdatePlayerInput, batch?: WriteBatch): Promise<PlayerRecord> {
    return withBatch(batch, async (current) => {
      const ref = doc(getDb(), 'players', id)
      const snapshot = await getDoc(ref)
      const stored = snapshot.data() as unknown as PlayerData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      const now = Timestamp.now()
      const next: PlayerData = {
        externalId: patch.externalId ?? stored.externalId,
        name: patch.name ?? stored.name,
        active: patch.active ?? stored.active,
        guest: patch.guest ?? stored.guest ?? false,
        createdAt: stored.createdAt,
        updatedAt: now,
      }

      current.set(ref, { ...next, updatedAt: serverTimestamp() })

      return toRecordFrom(id, next)
    })
  },

  remove(id: PlayerId, batch?: WriteBatch): Promise<void> {
    return withBatch(batch, (current) => {
      current.delete(doc(getDb(), 'players', id))
    })
  },
}

async function listAll(): Promise<PlayerRecord[]> {
  const snap = await getDocs(query(collection(getDb(), 'players'), orderBy('name', 'asc')))

  return snap.docs.map(toRecord)
}

function toRecord(snapshot: QueryDocumentSnapshot): PlayerRecord {
  const data = snapshot.data() as unknown as PlayerData

  return toRecordFrom(snapshot.id, data)
}

function toRecordFrom(id: string, data: PlayerData): PlayerRecord {
  return {
    id: id as PlayerId,
    externalId: data.externalId,
    name: data.name,
    active: data.active,
    guest: data.guest ?? false,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}
