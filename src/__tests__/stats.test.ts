import { describe, expect, it } from 'vitest'
import { aggregateStats } from '@/domain/stats'
import type { PlayerSeasonStats, StatsGame, YakuStats } from '@/domain/stats'
import { toGameId, toSeasonId } from '@/domain/types'
import type { PlayerId, Position } from '@/domain/types'
import {
  A,
  B,
  C,
  D,
  E,
  F,
  G,
  G3,
  H,
  TEMPORADA_CERRADA_SEASON_ID,
  TEMPORADA_COMPLETA_GAMES,
  TEMPORADA_COMPLETA_SEASON_ID,
} from '@/__tests__/fixtures/temporadaCompleta'
import { finalizedGame } from '@/test-utils/games'

const EMPTY_YAKU: YakuStats = {
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

function statsOf(stats: readonly PlayerSeasonStats[], playerId: PlayerId): PlayerSeasonStats {
  const entry = stats.find((candidate) => candidate.playerId === playerId)

  if (entry === undefined) {
    throw new Error(`sin estadísticas para ${playerId}`)
  }

  return entry
}

function expected(
  playerId: PlayerId,
  actualPoints: number,
  gamesPlayed: number,
  victories: number,
  positions: Record<Position, number>,
  yakuStats: YakuStats,
): PlayerSeasonStats {
  return {
    playerId,
    seasonId: TEMPORADA_COMPLETA_SEASON_ID,
    actualPoints,
    gamesPlayed,
    victories,
    positions,
    yakuStats,
  }
}

describe('T52 · agregación por jugador', () => {
  it('cuenta las partidas finalizadas y las victorias por jugador', () => {
    const stats = aggregateStats(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(stats.map((entry) => entry.playerId)).toStrictEqual([A, B, C, D])
    expect(statsOf(stats, A).gamesPlayed).toBe(2)
    expect(statsOf(stats, B).gamesPlayed).toBe(2)
    expect(statsOf(stats, C).gamesPlayed).toBe(2)
    expect(statsOf(stats, D).gamesPlayed).toBe(2)
    expect(statsOf(stats, A).victories).toBe(2)
    expect(statsOf(stats, B).victories).toBe(0)
    expect(statsOf(stats, C).victories).toBe(0)
    expect(statsOf(stats, D).victories).toBe(0)
  })

  it('desglosa las posiciones obtenidas por jugador', () => {
    const stats = aggregateStats(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(statsOf(stats, A).positions).toStrictEqual({ '1st': 2, '2nd': 0, '3rd': 0, '4th': 0 })
    expect(statsOf(stats, B).positions).toStrictEqual({ '1st': 0, '2nd': 1, '3rd': 1, '4th': 0 })
    expect(statsOf(stats, C).positions).toStrictEqual({ '1st': 0, '2nd': 1, '3rd': 1, '4th': 0 })
    expect(statsOf(stats, D).positions).toStrictEqual({ '1st': 0, '2nd': 0, '3rd': 0, '4th': 2 })
  })

  it('acumula la puntuación final con uma, que puede quedar por debajo del marcador bruto', () => {
    const stats = aggregateStats(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(statsOf(stats, A).actualPoints).toBe(56560)
    expect(statsOf(stats, B).actualPoints).toBe(50500)
    expect(statsOf(stats, C).actualPoints).toBe(47500)
    expect(statsOf(stats, D).actualPoints).toBe(35440)
  })

  it('no computa partidas abiertas ni de otras temporadas o sin temporada', () => {
    const stats = aggregateStats(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)
    const playerIds = stats.map((entry) => entry.playerId)

    expect(playerIds).toStrictEqual([A, B, C, D])
    expect(playerIds).not.toContain(E)
    expect(playerIds).not.toContain(F)
    expect(playerIds).not.toContain(G)
    expect(playerIds).not.toContain(H)
    expect(aggregateStats(TEMPORADA_COMPLETA_SEASON_ID, [G3])).toStrictEqual([])
  })

  it('muestra estadísticas sin exigir un mínimo de partidas', () => {
    const stats = aggregateStats(TEMPORADA_CERRADA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(stats.map((entry) => entry.playerId)).toStrictEqual([G, H])
    expect(statsOf(stats, G).gamesPlayed).toBe(1)
    expect(statsOf(stats, H).gamesPlayed).toBe(1)
    expect(statsOf(stats, G).actualPoints).toBe(26030)
  })

  it('agrega el documento completo de cada jugador', () => {
    const stats = aggregateStats(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(stats).toStrictEqual([
      expected(
        A,
        56560,
        2,
        2,
        { '1st': 2, '2nd': 0, '3rd': 0, '4th': 0 },
        { ...EMPTY_YAKU, riichi: 1, dora: 1, tsumo: 2 },
      ),
      expected(
        B,
        50500,
        2,
        0,
        { '1st': 0, '2nd': 1, '3rd': 1, '4th': 0 },
        { ...EMPTY_YAKU, riichi: 1, dora: 1, ron: 2, yakuman: 1 },
      ),
      expected(
        C,
        47500,
        2,
        0,
        { '1st': 0, '2nd': 1, '3rd': 1, '4th': 0 },
        { ...EMPTY_YAKU, dora: 2, ron: 2 },
      ),
      expected(
        D,
        35440,
        2,
        0,
        { '1st': 0, '2nd': 0, '3rd': 0, '4th': 2 },
        { ...EMPTY_YAKU, chombo: 1 },
      ),
    ])
  })
})

describe('T53 · contadores de yaku por jugador', () => {
  const S = toSeasonId('contadores')

  function counterGame(): StatsGame {
    return finalizedGame(
      toGameId('contadores'),
      S,
      [
        { playerId: A, name: 'Jugador A', score: 28000 },
        { playerId: B, name: 'Jugador B', score: 25000 },
        { playerId: C, name: 'Jugador C', score: 23000 },
        { playerId: D, name: 'Jugador D', score: 20000, chombo: true },
      ],
      [
        {
          playerId: A,
          resultType: 'tsumo',
          yaku: ['menzenTsumo', 'riichi', 'haiteiRaoyue', 'rinshanKaihou'],
          doraCount: 1,
          han: 6,
        },
        { playerId: B, resultType: 'ron', yaku: ['suukantsu', 'riichi'], doraCount: 0, han: 14 },
        {
          playerId: B,
          resultType: 'ron',
          yaku: ['daisuushii', 'daisangen', 'kokushiMusou', 'suukantsu'],
          doraCount: 0,
          han: 13,
        },
        {
          playerId: C,
          resultType: 'ron',
          yaku: ['chinitsu', 'sankantsu'],
          doraCount: 0,
          han: 13,
        },
        { playerId: E, resultType: 'ron', yaku: ['riichi'], doraCount: 0, han: 1 },
      ],
    )
  }

  it('acumula los nueve contadores por jugador', () => {
    const stats = aggregateStats(S, [counterGame()])

    expect(statsOf(stats, A).yakuStats).toStrictEqual({
      ...EMPTY_YAKU,
      riichi: 1,
      dora: 1,
      tsumo: 1,
      haiteiRaoyue: 1,
      rinshanKaihou: 1,
    })
    expect(statsOf(stats, B).yakuStats).toStrictEqual({
      ...EMPTY_YAKU,
      riichi: 1,
      kan: 8,
      ron: 2,
      yakuman: 2,
    })
    expect(statsOf(stats, C).yakuStats).toStrictEqual({
      ...EMPTY_YAKU,
      kan: 3,
      ron: 1,
      yakuman: 1,
    })
    expect(statsOf(stats, D).yakuStats).toStrictEqual({ ...EMPTY_YAKU, chombo: 1 })
  })

  it('una mano con cuatro yaku de límite suma un único yakuman', () => {
    const stats = aggregateStats(S, [counterGame()])

    expect(statsOf(stats, B).yakuStats.yakuman).toBe(2)
  })

  it('una mano con 13 han sin yaku de límite también cuenta como yakuman', () => {
    const stats = aggregateStats(S, [counterGame()])

    expect(statsOf(stats, C).yakuStats.yakuman).toBe(1)
  })

  it('una mano de un jugador sin resultado en esa partida no computa', () => {
    const stats = aggregateStats(S, [counterGame()])

    expect(stats.map((entry) => entry.playerId)).toStrictEqual([A, B, C, D])
  })
})
