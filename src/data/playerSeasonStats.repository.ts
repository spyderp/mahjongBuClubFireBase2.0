import { collectionGroup, doc, getDocs, query, where } from 'firebase/firestore'
import type { WriteBatch } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import type { PlayerSeasonStats } from '@/domain/stats'
import type { SeasonId } from '@/domain/types'

/**
 * RF-12.5: `playerSeasonStats` es un documento derivado. `replaceForSeason` solo borra y
 * escribe los de la temporada indicada dentro del `WriteBatch` que recibe, y no confirma
 * (RF-9.6 lo hace a la vez que el juego y los rankings: una mutación, un `WriteBatch`).
 *
 * Índice de grupo de colección `stats` con alcance COLLECTION_GROUP sobre `seasonId`: las dos
 * consultas de este repositorio van por `collectionGroup('stats')`, y Firestore **no** crea los
 * índices automáticos para grupos, ni siquiera de un solo campo. Sin el suyo, ambas fallan con
 * `failed-precondition`: la pantalla de estadísticas no carga y el borrado previo a reescribir
 * impide finalizar la partida (RF-12.5, RF-12.7).
 */
export const playerSeasonStatsRepository = {
  async listBySeason(seasonId: SeasonId): Promise<PlayerSeasonStats[]> {
    const snap = await getDocs(
      query(collectionGroup(getDb(), 'stats'), where('seasonId', '==', seasonId)),
    )

    return snap.docs.map((snapshot) => snapshot.data() as unknown as PlayerSeasonStats)
  },

  async replaceForSeason(
    seasonId: SeasonId,
    stats: ReadonlyArray<PlayerSeasonStats>,
    batch: WriteBatch,
  ): Promise<void> {
    const snap = await getDocs(
      query(collectionGroup(getDb(), 'stats'), where('seasonId', '==', seasonId)),
    )

    for (const existing of snap.docs) {
      batch.delete(existing.ref)
    }

    for (const stat of stats) {
      batch.set(doc(getDb(), 'playerSeasonStats', stat.playerId, 'stats', stat.seasonId), stat)
    }
  },
}
