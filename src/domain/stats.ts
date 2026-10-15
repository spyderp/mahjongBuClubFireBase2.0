import { computes } from './game'
import type { PlayerFinalResult } from './game'
import { isLimitYaku } from './yaku'
import type { YakuId } from './yaku'
import type { GameId, GameStatus, PlayerId, Position, SeasonId } from './types'

/** Mano ganadora ya calculada, con los datos que alimentan los contadores de RF-12.4. */
export type WinningHand = {
  readonly playerId: PlayerId
  readonly resultType: 'tsumo' | 'ron'
  readonly yaku: readonly YakuId[]
  readonly doraCount: number
  readonly han: number
}

/** Resultado final de una partida con el nombre desnormalizado para el ranking (RF-12.5). */
export type RankedGameResult = PlayerFinalResult & {
  readonly playerName: string
}

/** Vista de partida que consumen los agregados: resultados finalizados y manos ganadoras. */
export type StatsGame = {
  readonly gameId: GameId
  readonly seasonId: SeasonId | null
  readonly status: GameStatus
  readonly results: readonly RankedGameResult[]
  readonly hands: readonly WinningHand[]
}

/** Los nueve contadores acumulados de RF-12.4 sobre las partidas finalizadas del jugador. */
export type YakuStats = {
  readonly riichi: number
  readonly dora: number
  readonly kan: number
  readonly tsumo: number
  readonly ron: number
  readonly chombo: number
  readonly haiteiRaoyue: number
  readonly rinshanKaihou: number
  readonly yakuman: number
}

/** Agregación por jugador y temporada del esquema `playerSeasonStats` (`docs/domain.md` §5). */
export type PlayerSeasonStats = {
  readonly playerId: PlayerId
  readonly seasonId: SeasonId
  readonly actualPoints: number
  readonly gamesPlayed: number
  readonly victories: number
  readonly positions: Record<Position, number>
  readonly yakuStats: YakuStats
}

/** Una mano con 13 han o más sin yaku de límite también es yakuman (RF-12.4). */
const YAKUMAN_MIN_HAN = 13
const KAN_SANKANTSU = 3
const KAN_SUUKANTSU = 4

/** Misma forma que `YakuStats`, pero mutable: vive solo dentro del acumulador. */
type MutableYakuStats = {
  riichi: number
  dora: number
  kan: number
  tsumo: number
  ron: number
  chombo: number
  haiteiRaoyue: number
  rinshanKaihou: number
  yakuman: number
}

type Accumulator = {
  playerId: PlayerId
  actualPoints: number
  gamesPlayed: number
  victories: number
  positions: Record<Position, number>
  yakuStats: MutableYakuStats
}

/**
 * RF-12.7 a RF-12.8: agrega por jugador solo las partidas `finalized` de la temporada indicada.
 * El resultado está ordenado por `playerId` para que dos recálculos del mismo histórico
 * produzcan siempre el mismo array (RNF-1).
 */
export function aggregateStats(
  seasonId: SeasonId,
  games: readonly StatsGame[],
): readonly PlayerSeasonStats[] {
  const byPlayer = new Map<PlayerId, Accumulator>()

  for (const game of games) {
    if (!computes(game.status) || game.seasonId !== seasonId) {
      continue
    }

    const playersInGame = new Map<PlayerId, Accumulator>()

    for (const result of game.results) {
      const player = byPlayer.get(result.playerId) ?? newAccumulator(result.playerId)

      player.actualPoints += result.finalScore
      player.gamesPlayed += 1
      if (result.position === '1st') {
        player.victories += 1
      }
      player.positions[result.position] += 1
      if (result.chombo) {
        player.yakuStats.chombo += 1
      }

      byPlayer.set(result.playerId, player)
      playersInGame.set(result.playerId, player)
    }

    for (const hand of game.hands) {
      const player = playersInGame.get(hand.playerId)

      if (player === undefined) {
        continue
      }

      accumulateHand(player.yakuStats, hand)
    }
  }

  return [...byPlayer.values()]
    .map((player) => toPlayerSeasonStats(seasonId, player))
    .sort(byPlayerId)
}

function newAccumulator(playerId: PlayerId): Accumulator {
  return {
    playerId,
    actualPoints: 0,
    gamesPlayed: 0,
    victories: 0,
    positions: { '1st': 0, '2nd': 0, '3rd': 0, '4th': 0 },
    yakuStats: emptyYakuStats(),
  }
}

function emptyYakuStats(): MutableYakuStats {
  return {
    riichi: 0,
    dora: 0,
    kan: 0,
    tsumo: 0,
    ron: 0,
    chombo: 0,
    haiteiRaoyue: 0,
    rinshanKaihou: 0,
    yakuman: 0,
  }
}

function toPlayerSeasonStats(seasonId: SeasonId, player: Accumulator): PlayerSeasonStats {
  return {
    playerId: player.playerId,
    seasonId,
    actualPoints: player.actualPoints,
    gamesPlayed: player.gamesPlayed,
    victories: player.victories,
    positions: player.positions,
    yakuStats: player.yakuStats,
  }
}

/**
 * RF-12.4: acumula los contadores de una mano ganadora. `tsumo` y `ron` se leen del tipo de
 * resultado; `riichi`, hai tei raoyue y renchán de apertura, de los yaku que el catálogo de
 * `yaku.ts` marca con `statKey`; `kan` del yaku correspondiente; `yakuman` cuenta la mano.
 */
function accumulateHand(stats: MutableYakuStats, hand: WinningHand): void {
  stats.dora += hand.doraCount

  if (hand.resultType === 'ron') {
    stats.ron += 1
  } else {
    stats.tsumo += 1
  }

  for (const yakuId of hand.yaku) {
    switch (yakuId) {
      case 'riichi':
        stats.riichi += 1
        break
      case 'haiteiRaoyue':
        stats.haiteiRaoyue += 1
        break
      case 'rinshanKaihou':
        stats.rinshanKaihou += 1
        break
      default:
        break
    }
  }

  stats.kan += kanOf(hand.yaku)

  if (isYakuman(hand)) {
    stats.yakuman += 1
  }
}

function kanOf(yaku: readonly YakuId[]): number {
  if (yaku.includes('sankantsu')) {
    return KAN_SANKANTSU
  }

  if (yaku.includes('suukantsu')) {
    return KAN_SUUKANTSU
  }

  return 0
}

function isYakuman(hand: WinningHand): boolean {
  return hand.yaku.some(isLimitYaku) || hand.han >= YAKUMAN_MIN_HAN
}

function byPlayerId(a: PlayerSeasonStats, b: PlayerSeasonStats): number {
  return a.playerId < b.playerId ? -1 : 1
}
