import type { PlayerId } from './types'

/** Jugador candidato a la clasificación con sus claves de orden (RF-13.3). */
export type RankablePlayer = {
  readonly playerId: PlayerId
  readonly playerName: string
  readonly points: number
  readonly victories: number
  readonly seconds: number
}

/** Entrada de la clasificación ya posicionada. */
export type RankedPlayer = RankablePlayer & {
  readonly rank: number
}

/**
 * RF-13.1 a RF-13.3: ordena por puntuación acumulada con uma y desempata por victorias,
 * segundas posiciones y nombre. El desempate es total: a igualdad absoluta manda el
 * `playerId`, de modo que el orden no depende del orden de entrada del array (RF-13.1, RNF-1).
 */
export function buildRanking(players: readonly RankablePlayer[]): readonly RankedPlayer[] {
  return [...players].sort(byRank).map((player, index) => ({
    ...player,
    rank: index + 1,
  }))
}

function byRank(a: RankablePlayer, b: RankablePlayer): number {
  if (a.points !== b.points) {
    return b.points - a.points
  }

  if (a.victories !== b.victories) {
    return b.victories - a.victories
  }

  if (a.seconds !== b.seconds) {
    return b.seconds - a.seconds
  }

  if (a.playerName < b.playerName) {
    return -1
  }

  if (a.playerName > b.playerName) {
    return 1
  }

  return a.playerId < b.playerId ? -1 : 1
}
