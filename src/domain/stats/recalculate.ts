import { computes } from '../game'
import { buildRanking } from '../ranking'
import type { RankablePlayer, RankedPlayer } from '../ranking'
import { aggregateStats } from '../stats'
import type { PlayerSeasonStats, StatsGame } from '../stats'
import type { PlayerId, SeasonId } from '../types'

/** Documentos derivados que escribir tras un cambio de partida (RF-9.6, RF-12.7). */
export type RecalculateOutput = {
  readonly stats: readonly PlayerSeasonStats[]
  readonly rankings: readonly RankedPlayer[]
}

/**
 * RF-0.2, RF-9.5 y RF-9.6: recalcula `playerSeasonStats` y `rankings` desde `games[]`.
 * Es idempotente y puro: mismo input, mismo output, por eso la finalización deshecha solo
 * necesita volver a invocarse (RNF-3).
 */
export function recalculate(seasonId: SeasonId, games: readonly StatsGame[]): RecalculateOutput {
  const stats = aggregateStats(seasonId, games)
  const rankings = buildRanking(stats.map((player) => rankableOf(player, games)))

  return { stats, rankings }
}

function rankableOf(player: PlayerSeasonStats, games: readonly StatsGame[]): RankablePlayer {
  return {
    playerId: player.playerId,
    playerName: playerNameOf(player.playerId, games),
    points: player.actualPoints,
    victories: player.victories,
    seconds: player.positions['2nd'],
  }
}

/**
 * RF-13.6: el desempate alfabético usa el nombre desnormalizado del resultado finalizado.
 * Si ningún resultado trae nombre, el jugador entra en la clasificación sin nombre.
 */
function playerNameOf(playerId: PlayerId, games: readonly StatsGame[]): string {
  for (const game of games) {
    if (!computes(game.status)) {
      continue
    }

    for (const result of game.results) {
      if (result.playerId === playerId && result.playerName.length > 0) {
        return result.playerName
      }
    }
  }

  return ''
}
