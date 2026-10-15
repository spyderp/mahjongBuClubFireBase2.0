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
import { canUpdateRange } from '@/domain/seasons'
import type { SeasonRange } from '@/domain/seasons'
import type { Season, SeasonId, SeasonStatus } from '@/domain/types'
import type { Timestamp as DomainTimestamp } from '@/domain/types'

export type SeasonRecord = { readonly id: SeasonId } & Season

export type CreateSeasonInput = {
  readonly title: string
  readonly dateFrom: DomainTimestamp
  readonly dateTo: DomainTimestamp
  readonly status?: SeasonStatus
}

export type UpdateSeasonInput = {
  readonly title?: string
  readonly dateFrom?: DomainTimestamp
  readonly dateTo?: DomainTimestamp
}

type SeasonData = {
  readonly title: string
  readonly dateFrom: DomainTimestamp
  readonly dateTo: DomainTimestamp
  readonly status: SeasonStatus
  readonly createdAt: DomainTimestamp
  readonly updatedAt: DomainTimestamp
}

/**
 * RF-11.1 a RF-11.7 y RF-0.5: CRUD de temporadas. Los utilitarios de solapamiento y de rango
 * son consultas reales; el dominio (`seasons.ts`) decide después si la temporada admite la
 * fecha de una partida o si su rango puede moverse (RF-0.6).
 */
export const seasonsRepository = {
  async list(): Promise<SeasonRecord[]> {
    const snap = await getDocs(query(collection(getDb(), 'seasons'), orderBy('dateFrom', 'asc')))

    return snap.docs.map(toRecord)
  },

  create(input: CreateSeasonInput, batch?: WriteBatch): Promise<SeasonRecord> {
    return withBatch(batch, (current) => {
      const ref = doc(collection(getDb(), 'seasons'))
      const now = Timestamp.now()
      const status = input.status ?? 'open'

      current.set(ref, {
        title: input.title,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      return toRecordFrom(ref.id, {
        title: input.title,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        status,
        createdAt: now,
        updatedAt: now,
      })
    })
  },

  update(id: SeasonId, patch: UpdateSeasonInput, batch?: WriteBatch): Promise<SeasonRecord> {
    return withBatch(batch, async (current) => {
      const ref = doc(getDb(), 'seasons', id)
      const stored = (await getDoc(ref)).data() as unknown as SeasonData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      /**
       * RF-0.6: el rango de una temporada cerrada es inmutable. El título sí se puede corregir,
       * así que la comprobación mira solo si el parche mueve `dateFrom` o `dateTo`. Sin esto,
       * `canUpdateRange` era una función que solo ejecutaban sus propios tests.
       */
      const movesRange = patch.dateFrom !== undefined || patch.dateTo !== undefined
      if (movesRange && !canUpdateRange(toRange(id, stored))) {
        throw new DataError('notOpen')
      }

      const now = Timestamp.now()
      const next: SeasonData = {
        title: patch.title ?? stored.title,
        dateFrom: patch.dateFrom ?? stored.dateFrom,
        dateTo: patch.dateTo ?? stored.dateTo,
        status: stored.status,
        createdAt: stored.createdAt,
        updatedAt: now,
      }

      current.set(ref, { ...next, updatedAt: serverTimestamp() })

      return toRecordFrom(id, next)
    })
  },

  close(id: SeasonId, batch?: WriteBatch): Promise<SeasonRecord> {
    return withBatch(batch, async (current) => {
      const ref = doc(getDb(), 'seasons', id)
      const stored = (await getDoc(ref)).data() as unknown as SeasonData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      const now = Timestamp.now()
      const next: SeasonData = { ...stored, status: 'closed', updatedAt: now }

      current.set(ref, { ...next, updatedAt: serverTimestamp() })

      return toRecordFrom(id, next)
    })
  },

  /**
   * RF-11.5 y RF-11.6: temporadas cuyo rango contiene la fecha indicada.
   * Índice compuesto: seasons (dateFrom ASC, dateTo ASC).
   */
  async findByDateRange(date: DomainTimestamp): Promise<SeasonRecord[]> {
    const snap = await getDocs(
      query(
        collection(getDb(), 'seasons'),
        where('dateFrom', '<=', date),
        where('dateTo', '>=', date),
        orderBy('dateFrom', 'asc'),
        orderBy('dateTo', 'asc'),
      ),
    )

    return snap.docs.map(toRecord)
  },

  /** RF-11.2: temporadas cuyo rango solapa con el candidato, de la primera a la última. Índice compuesto: seasons (dateFrom ASC, dateTo ASC). */
  async findOverlapping(from: DomainTimestamp, to: DomainTimestamp): Promise<SeasonRecord[]> {
    const snap = await getDocs(
      query(
        collection(getDb(), 'seasons'),
        where('dateTo', '>=', from),
        where('dateFrom', '<=', to),
        orderBy('dateFrom', 'asc'),
        orderBy('dateTo', 'asc'),
      ),
    )

    return snap.docs.map(toRecord)
  },
}

function toRecord(snapshot: QueryDocumentSnapshot): SeasonRecord {
  const data = snapshot.data() as unknown as SeasonData

  return toRecordFrom(snapshot.id, data)
}

function toRecordFrom(id: string, data: SeasonData): SeasonRecord {
  return {
    id: id as SeasonId,
    title: data.title,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    status: data.status,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

/** Vista de dominio mínima para que `canUpdateRange` decida sin duplicar la regla aquí. */
function toRange(id: string, data: SeasonData): SeasonRange {
  return {
    id: id as SeasonId,
    title: data.title,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    status: data.status,
  }
}
