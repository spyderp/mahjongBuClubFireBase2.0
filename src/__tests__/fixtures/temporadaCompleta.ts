import type { StatsGame } from '@/domain/stats'
import { toGameId, toPlayerId, toSeasonId } from '@/domain/types'
import { finalizedGame } from '@/test-utils/games'

export const TEMPORADA_COMPLETA_SEASON_ID = toSeasonId('tem1')
export const TEMPORADA_CERRADA_SEASON_ID = toSeasonId('tem2')

export const A = toPlayerId('a')
export const B = toPlayerId('b')
export const C = toPlayerId('c')
export const D = toPlayerId('d')
export const E = toPlayerId('e')
export const F = toPlayerId('f')
export const G = toPlayerId('g')
export const H = toPlayerId('h')

export const G1: StatsGame = finalizedGame(
  toGameId('g1'),
  TEMPORADA_COMPLETA_SEASON_ID,
  [
    { playerId: A, name: 'Jugador A', score: 26500 },
    { playerId: B, name: 'Jugador B', score: 23500 },
    { playerId: C, name: 'Jugador C', score: 26500 },
    { playerId: D, name: 'Jugador D', score: 23500 },
  ],
  [
    { playerId: A, resultType: 'tsumo', yaku: ['menzenTsumo'], doraCount: 0, han: 1 },
    { playerId: B, resultType: 'ron', yaku: ['riichi'], doraCount: 1, han: 2 },
    { playerId: C, resultType: 'ron', yaku: ['tanyao'], doraCount: 1, han: 3 },
  ],
)

export const G2: StatsGame = finalizedGame(
  toGameId('g2'),
  TEMPORADA_COMPLETA_SEASON_ID,
  [
    { playerId: A, name: 'Jugador A', score: 30000 },
    { playerId: B, name: 'Jugador B', score: 27000 },
    { playerId: C, name: 'Jugador C', score: 21000 },
    { playerId: D, name: 'Jugador D', score: 12000, chombo: true },
  ],
  [
    { playerId: A, resultType: 'tsumo', yaku: ['menzenTsumo', 'riichi'], doraCount: 1, han: 4 },
    { playerId: B, resultType: 'ron', yaku: ['daisuushii'], doraCount: 0, han: 13 },
    { playerId: C, resultType: 'ron', yaku: ['tanyao'], doraCount: 1, han: 4 },
  ],
)

export const G3: StatsGame = {
  gameId: toGameId('g3'),
  seasonId: TEMPORADA_COMPLETA_SEASON_ID,
  status: 'open',
  results: [],
  hands: [{ playerId: E, resultType: 'ron', yaku: ['riichi'], doraCount: 0, han: 1 }],
}

export const G4: StatsGame = finalizedGame(
  toGameId('g4'),
  TEMPORADA_CERRADA_SEASON_ID,
  [
    { playerId: G, name: 'Jugador G', score: 26000 },
    { playerId: H, name: 'Jugador H', score: 24000 },
  ],
  [{ playerId: G, resultType: 'ron', yaku: ['riichi'], doraCount: 0, han: 1 }],
)

export const G5: StatsGame = finalizedGame(
  toGameId('g5'),
  null,
  [
    { playerId: E, name: 'Jugador E', score: 26000 },
    { playerId: F, name: 'Jugador F', score: 24000 },
  ],
  [{ playerId: E, resultType: 'ron', yaku: ['riichi'], doraCount: 0, han: 1 }],
)

export const TEMPORADA_COMPLETA_GAMES: readonly StatsGame[] = [G1, G2, G3, G4, G5]
