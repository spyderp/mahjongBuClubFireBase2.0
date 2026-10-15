import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot, WriteBatch } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { withBatch } from '@/data/batch'
import { DataError } from '@/data/errors'
import type { PlayerDelta, TurnValue } from '@/domain/turn'
import type { ResultType, Wind } from '@/domain/types'
import type { GameId, PlayerId } from '@/domain/types'
import type { Timestamp as DomainTimestamp } from '@/domain/types'
import type { YakuId } from '@/domain/yaku'

export type TurnRecord = {
  readonly turnNo: number
  readonly wind: Wind
  readonly dealerId: PlayerId
  readonly honba: number
  readonly resultType: ResultType
  readonly yaku: readonly YakuId[]
  readonly yakuHan: number
  readonly doraCount: number
  readonly fu: number
  readonly tenpai: readonly PlayerId[]
  readonly riichiDeclaredBy: readonly PlayerId[]
  readonly riichiSticks: number
  readonly value: readonly TurnValue[]
  readonly deltas: readonly PlayerDelta[]
  readonly capturedBy: string
  readonly isRenchan: boolean
  readonly isFinalTurn: boolean
  readonly createdAt: DomainTimestamp
}

export type CreateTurnInput = Omit<TurnRecord, 'createdAt'>

export type UpdateTurnPatch = {
  readonly wind?: Wind
  readonly dealerId?: PlayerId
  readonly honba?: number
  readonly resultType?: ResultType
  readonly yaku?: readonly YakuId[]
  readonly yakuHan?: number
  readonly doraCount?: number
  readonly fu?: number
  readonly tenpai?: readonly PlayerId[]
  readonly riichiDeclaredBy?: readonly PlayerId[]
  readonly riichiSticks?: number
  readonly value?: readonly TurnValue[]
  readonly deltas?: readonly PlayerDelta[]
  readonly capturedBy?: string
  readonly isRenchan?: boolean
  readonly isFinalTurn?: boolean
}

type TurnData = {
  readonly turnNo: number
  readonly wind: Wind
  readonly dealerId: PlayerId
  readonly honba: number
  readonly resultType: ResultType
  readonly yaku: readonly YakuId[]
  readonly yakuHan: number
  readonly doraCount: number
  readonly fu: number
  readonly tenpai: readonly PlayerId[]
  readonly riichiDeclaredBy: readonly PlayerId[]
  readonly riichiSticks: number
  readonly value: readonly TurnValue[]
  readonly deltas: readonly PlayerDelta[]
  readonly capturedBy: string
  readonly isRenchan: boolean
  readonly isFinalTurn: boolean
  readonly createdAt: DomainTimestamp
}

type GameStatusData = {
  readonly status: 'open' | 'finalized' | 'unfinished' | 'aborted'
}

/**
 * RF-3.1 a RF-3.8: turnos de una partida. La numeración es correlativa y sin huecos
 * (AGENT.md → Data model): el ID del documento es el turno rellenado a dos dígitos para
 * que el orden lexicográfico sea el cronológico. Registrar un turno solo es válido sobre
 * una partida `open`, y además refresca `updatedAt` del juego para la regla de los 7 días
 * (RF-10.4). El rechazo del turno duplicado es la política de resolución de la captura sin
 * conexión (AGENT.md → Captura sin conexión).
 */
export const turnsRepository = {
  async list(gameId: GameId): Promise<TurnRecord[]> {
    const snap = await getDocs(
      query(collection(getDb(), 'games', gameId, 'turns'), orderBy('turnNo', 'asc')),
    )

    return snap.docs.map(toRecord)
  },

  create(gameId: GameId, input: CreateTurnInput, batch?: WriteBatch): Promise<TurnRecord> {
    return withBatch(batch, async (current) => {
      await assertOpenGame(gameId)
      await assertSequentialTurn(gameId, input.turnNo)

      const ref = doc(collection(getDb(), 'games', gameId, 'turns'), turnDocId(input.turnNo))
      const now = Timestamp.now()

      current.set(ref, { ...input, createdAt: serverTimestamp() })
      current.update(doc(getDb(), 'games', gameId), { updatedAt: serverTimestamp() })

      return { ...input, createdAt: now }
    })
  },

  update(
    gameId: GameId,
    turnNo: number,
    patch: UpdateTurnPatch,
    batch?: WriteBatch,
  ): Promise<TurnRecord> {
    return withBatch(batch, async (current) => {
      await assertOpenGame(gameId)

      const ref = doc(collection(getDb(), 'games', gameId, 'turns'), turnDocId(turnNo))
      const snapshot = await getDoc(ref)
      const stored = snapshot.data() as unknown as TurnData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      const next = mergePatch(stored, patch)

      current.set(ref, next)
      current.update(doc(getDb(), 'games', gameId), { updatedAt: serverTimestamp() })

      return next
    })
  },

  /** RF-3.8: siguiente número de turno sin huecos: el máximo registrado más uno. */
  async nextNumber(gameId: GameId): Promise<number> {
    await assertExists(gameId)
    const snap = await getDocs(
      query(collection(getDb(), 'games', gameId, 'turns'), orderBy('turnNo', 'asc')),
    )

    return snap.docs.reduce((max, snapshot) => Math.max(max, turnNoOf(snapshot)), 0) + 1
  },
}

function toRecord(snapshot: QueryDocumentSnapshot): TurnRecord {
  return snapshot.data() as unknown as TurnRecord
}

function turnNoOf(snapshot: QueryDocumentSnapshot): number {
  return (snapshot.data() as unknown as TurnData).turnNo
}

function mergePatch(stored: TurnData, patch: UpdateTurnPatch): TurnRecord {
  return {
    turnNo: stored.turnNo,
    wind: patch.wind ?? stored.wind,
    dealerId: patch.dealerId ?? stored.dealerId,
    honba: patch.honba ?? stored.honba,
    resultType: patch.resultType ?? stored.resultType,
    yaku: patch.yaku ?? stored.yaku,
    yakuHan: patch.yakuHan ?? stored.yakuHan,
    doraCount: patch.doraCount ?? stored.doraCount,
    fu: patch.fu ?? stored.fu,
    tenpai: patch.tenpai ?? stored.tenpai,
    riichiDeclaredBy: patch.riichiDeclaredBy ?? stored.riichiDeclaredBy,
    riichiSticks: patch.riichiSticks ?? stored.riichiSticks,
    value: patch.value ?? stored.value,
    deltas: patch.deltas ?? stored.deltas,
    capturedBy: patch.capturedBy ?? stored.capturedBy,
    isRenchan: patch.isRenchan ?? stored.isRenchan,
    isFinalTurn: patch.isFinalTurn ?? stored.isFinalTurn,
    createdAt: stored.createdAt,
  }
}

async function assertOpenGame(gameId: GameId): Promise<void> {
  const stored = (await getDoc(doc(getDb(), 'games', gameId))).data()
  const game = stored as unknown as GameStatusData | undefined

  if (game === undefined) {
    throw new DataError('notFound')
  }

  if (game.status === 'finalized') {
    throw new DataError('finalizedGame')
  }

  if (game.status !== 'open') {
    throw new DataError('notOpen')
  }
}

async function assertExists(gameId: GameId): Promise<void> {
  const stored = (await getDoc(doc(getDb(), 'games', gameId))).data()

  if (stored === undefined) {
    throw new DataError('notFound')
  }
}

async function assertSequentialTurn(gameId: GameId, turnNo: number): Promise<void> {
  const snap = await getDocs(
    query(collection(getDb(), 'games', gameId, 'turns'), orderBy('turnNo', 'asc')),
  )
  let max = 0

  for (const snapshot of snap.docs) {
    const existing = turnNoOf(snapshot)

    if (existing === turnNo) {
      throw new DataError('duplicateNumber')
    }

    max = Math.max(max, existing)
  }

  if (turnNo !== max + 1) {
    throw new DataError('gapInSequence')
  }
}

function turnDocId(turnNo: number): string {
  return String(turnNo).padStart(2, '0')
}
