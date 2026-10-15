import { collection, doc, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore'
import type { QueryDocumentSnapshot, WriteBatch } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import type { RankedPlayer } from '@/domain/ranking'
import type { PlayerId, SeasonId } from '@/domain/types'
import type { Timestamp as DomainTimestamp } from '@/domain/types'

export type RankingEntry = RankedPlayer & {
  readonly gamesPlayed: number
}

export type RankingRecord = {
  readonly id: PlayerId
  readonly playerId: PlayerId
  readonly seasonId: SeasonId
  readonly points: number
  readonly gamesPlayed: number
  readonly rank: number
  readonly updatedAt: DomainTimestamp
}

type RankingData = {
  readonly playerId: PlayerId
  readonly seasonId: SeasonId
  readonly points: number
  readonly gamesPlayed: number
  readonly rank: number
  readonly updatedAt: DomainTimestamp
}

/**
 * RF-13.5: `rankings` es un documento derivado por temporada. `replaceForSeason` borra y
 * escribe solo los de la temporada indicada en el `WriteBatch` que recibe, sin confirmar
 * (RF-9.6, RF-13.6). El documento guarda las claves de la tabla y `rank`; el nombre y los
 * desempates se resuelven desde la caché de jugadores y de estadísticas, no se duplican
 * (AGENT.md → Data model).
 */
export const rankingsRepository = {
  async listBySeason(seasonId: SeasonId): Promise<RankingRecord[]> {
    // Índice compuesto: rankings (rank ASC) — RF-13.1
    const snap = await getDocs(
      query(collection(getDb(), 'rankings', seasonId, 'players'), orderBy('rank', 'asc')),
    )

    return snap.docs.map(toRecord)
  },

  async replaceForSeason(
    seasonId: SeasonId,
    entries: readonly RankingEntry[],
    batch: WriteBatch,
  ): Promise<void> {
    const existing = await getDocs(collection(getDb(), 'rankings', seasonId, 'players'))

    for (const snapshot of existing.docs) {
      batch.delete(snapshot.ref)
    }

    for (const entry of entries) {
      batch.set(doc(getDb(), 'rankings', seasonId, 'players', entry.playerId), {
        playerId: entry.playerId,
        seasonId,
        points: entry.points,
        gamesPlayed: entry.gamesPlayed,
        rank: entry.rank,
        updatedAt: serverTimestamp(),
      })
    }
  },
}

function toRecord(snapshot: QueryDocumentSnapshot): RankingRecord {
  const data = snapshot.data() as unknown as RankingData

  return {
    id: snapshot.id as PlayerId,
    playerId: data.playerId,
    seasonId: data.seasonId,
    points: data.points,
    gamesPlayed: data.gamesPlayed,
    rank: data.rank,
    updatedAt: data.updatedAt,
  }
}
