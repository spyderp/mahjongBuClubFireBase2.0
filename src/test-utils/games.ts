import { finalizeResults } from '@/domain/game'
import type { FinalizablePlayer } from '@/domain/game'
import type { RankedGameResult, StatsGame, WinningHand } from '@/domain/stats'
import type { GameId, PlayerId, SeasonId, Seat } from '@/domain/types'

const SEAT_ORDER: readonly Seat[] = ['east', 'south', 'west', 'north']

export type Standing = {
  readonly playerId: PlayerId
  readonly name: string
  readonly score: number
  readonly chombo?: boolean
}

/** Resultados finalizados con `finalizeResults` y el nombre desnormalizado de cada jugador. */
export function resultsOf(standings: readonly Standing[]): readonly RankedGameResult[] {
  const players: readonly FinalizablePlayer[] = standings.map((entry, index) => ({
    playerId: entry.playerId,
    seat: SEAT_ORDER[index] ?? 'east',
    score: entry.score,
    chombo: entry.chombo ?? false,
    bankrupt: false,
  }))
  const names = new Map(standings.map((entry) => [entry.playerId, entry.name] as const))

  return finalizeResults(players).map((result) => ({
    ...result,
    playerName: names.get(result.playerId) ?? '',
  }))
}

/** Partida finalizada lista para `aggregateStats` y `recalculate`. */
export function finalizedGame(
  gameId: GameId,
  seasonId: SeasonId | null,
  standings: readonly Standing[],
  hands: readonly WinningHand[] = [],
): StatsGame {
  return {
    gameId,
    seasonId,
    status: 'finalized',
    results: resultsOf(standings),
    hands,
  }
}
