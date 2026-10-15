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
import type { Game, GameId, GameLength, GameStatus, Position } from '@/domain/types'
import type { PlayerId, Ruleset, SeasonId, Seat } from '@/domain/types'
import type { Timestamp as DomainTimestamp } from '@/domain/types'

export type GameParticipant = {
  readonly playerId: PlayerId
  readonly seat: Seat
}

export type GameResultDoc = {
  readonly playerId: PlayerId
  readonly playerName: string
  readonly seat: Seat
  readonly finalScore: number
  readonly finalPosition: Position
  readonly uma: number
  readonly chombo: boolean
  readonly bankrupt: boolean
}

export type GameAuditEntry = {
  readonly at: DomainTimestamp
  readonly by: string
  readonly action: 'finalize' | 'unfinalize'
  readonly reason?: string
}

export type GameRecord = { readonly id: GameId } & Game & {
    readonly players: readonly GameParticipant[]
    readonly results: readonly GameResultDoc[]
    readonly finalizationAudit: readonly GameAuditEntry[]
  }

export type CreateGameInput = {
  readonly seasonId: SeasonId | null
  readonly date: DomainTimestamp
  readonly gameLength: GameLength
  readonly ruleset: Ruleset
  readonly rulesetVersion: string
  readonly startPoints: number
  readonly players: readonly GameParticipant[]
}

export type UpdateGamePatch = {
  readonly seasonId?: SeasonId | null
  readonly date?: DomainTimestamp
  readonly gameLength?: GameLength
  readonly ruleset?: Ruleset
  readonly rulesetVersion?: string
  readonly startPoints?: number
  readonly status?: GameStatus
  readonly mustFinalize?: boolean
  readonly players?: readonly GameParticipant[]
  readonly results?: readonly GameResultDoc[]
  readonly finalizationAudit?: readonly GameAuditEntry[]
}

type GameData = {
  readonly seasonId: SeasonId | null
  readonly date: DomainTimestamp
  readonly gameLength: GameLength
  readonly ruleset: Ruleset
  readonly rulesetVersion: string
  readonly startPoints: number
  readonly status: GameStatus
  readonly mustFinalize: boolean
  readonly players: readonly GameParticipant[]
  readonly results: readonly GameResultDoc[]
  readonly finalizationAudit: readonly GameAuditEntry[]
  readonly createdAt: DomainTimestamp
  readonly updatedAt: DomainTimestamp
}

/**
 * RF-2.1 a RF-2.9, RF-0.1 y RF-9.3: ciclo de vida de las partidas. `create` abre en
 * `'open'` con `mustFinalize: false`; `update` deja el resto al dominio, pero a un juego
 * `finalized` solo se le permite el parche que deshace la finalización (RF-9.3), y a los
 * terminales (`unfinished`/`aborted`) ninguna mutación (RF-0.3). El campo `players` es la
 * mesa completa (RF-2.1, HU-1): el repositorio la persiste para construir los turnos.
 */
export const gamesRepository = {
  async listBySeason(seasonId: SeasonId): Promise<GameRecord[]> {
    // Índice compuesto: games (seasonId ASC, date DESC) — RF-12.5
    const snap = await getDocs(
      query(
        collection(getDb(), 'games'),
        where('seasonId', '==', seasonId),
        orderBy('date', 'desc'),
      ),
    )

    return snap.docs.map(toRecord)
  },

  /** RF-10.4 y RF-10.5: partidas abiertas, de la más recientemente tocada a la más vieja. Índice compuesto: games (status ASC, updatedAt DESC). */
  async listOpen(): Promise<GameRecord[]> {
    const snap = await getDocs(
      query(
        collection(getDb(), 'games'),
        where('status', '==', 'open'),
        orderBy('updatedAt', 'desc'),
      ),
    )

    return snap.docs.map(toRecord)
  },

  async getById(id: GameId): Promise<GameRecord | null> {
    const snapshot = await getDoc(doc(getDb(), 'games', id))
    const data = snapshot.data() as unknown as GameData | undefined

    return data === undefined ? null : toRecordFrom(id, data)
  },

  create(input: CreateGameInput, batch?: WriteBatch): Promise<GameRecord> {
    return withBatch(batch, (current) => {
      const ref = doc(collection(getDb(), 'games'))
      const now = Timestamp.now()
      const fields = {
        seasonId: input.seasonId,
        date: input.date,
        gameLength: input.gameLength,
        ruleset: input.ruleset,
        rulesetVersion: input.rulesetVersion,
        startPoints: input.startPoints,
        status: 'open' as GameStatus,
        mustFinalize: false,
        players: input.players,
        results: [],
        finalizationAudit: [],
      }

      current.set(ref, { ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })

      return toRecordFrom(ref.id, { ...fields, createdAt: now, updatedAt: now })
    })
  },

  update(id: GameId, patch: UpdateGamePatch, batch?: WriteBatch): Promise<GameRecord> {
    return withBatch(batch, async (current) => {
      const ref = doc(getDb(), 'games', id)
      const stored = (await getDoc(ref)).data() as unknown as GameData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      if (stored.status === 'finalized' && !isUnfinalizePatch(patch)) {
        throw new DataError('finalizedGame')
      }

      if (stored.status !== 'open' && stored.status !== 'finalized') {
        throw new DataError('notOpen')
      }

      const now = Timestamp.now()
      const next: GameData = {
        ...mergePatch(stored, patch),
        createdAt: stored.createdAt,
        updatedAt: now,
      }

      current.set(ref, { ...next, updatedAt: serverTimestamp() })

      return toRecordFrom(id, next)
    })
  },

  remove(id: GameId, batch?: WriteBatch): Promise<void> {
    return withBatch(batch, async (current) => {
      const ref = doc(getDb(), 'games', id)
      const stored = (await getDoc(ref)).data() as unknown as GameData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      if (stored.status !== 'open') {
        throw new DataError('notOpen')
      }

      current.delete(ref)
    })
  },
}

function toRecord(snapshot: QueryDocumentSnapshot): GameRecord {
  const data = snapshot.data() as unknown as GameData

  return toRecordFrom(snapshot.id, data)
}

function toRecordFrom(id: string, data: GameData): GameRecord {
  return {
    id: id as GameId,
    seasonId: data.seasonId,
    date: data.date,
    gameLength: data.gameLength,
    ruleset: data.ruleset,
    rulesetVersion: data.rulesetVersion,
    startPoints: data.startPoints,
    status: data.status,
    mustFinalize: data.mustFinalize,
    players: data.players,
    results: data.results,
    finalizationAudit: data.finalizationAudit,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mergePatch(
  current: GameData,
  patch: UpdateGamePatch,
): Omit<GameData, 'createdAt' | 'updatedAt'> {
  return {
    seasonId: patch.seasonId !== undefined ? patch.seasonId : current.seasonId,
    date: patch.date ?? current.date,
    gameLength: patch.gameLength ?? current.gameLength,
    ruleset: patch.ruleset ?? current.ruleset,
    rulesetVersion: patch.rulesetVersion ?? current.rulesetVersion,
    startPoints: patch.startPoints ?? current.startPoints,
    status: patch.status ?? current.status,
    mustFinalize: patch.mustFinalize ?? current.mustFinalize,
    players: patch.players ?? current.players,
    results: patch.results ?? current.results,
    finalizationAudit: patch.finalizationAudit ?? current.finalizationAudit,
  }
}

/**
 * RF-9.3 y RF-9.4: el único cambio aceptado sobre un juego finalizado es deshacer la
 * finalización: volver a `'open'` añadiendo una entrada de auditoría `unfinalize` sobre
 * las que ya había. Cualquier otro parche queda rechazado.
 */
function isUnfinalizePatch(patch: UpdateGamePatch): boolean {
  if (patch.status !== 'open' || patch.finalizationAudit === undefined) {
    return false
  }

  const last = patch.finalizationAudit[patch.finalizationAudit.length - 1]

  return last !== undefined && last.action === 'unfinalize'
}
