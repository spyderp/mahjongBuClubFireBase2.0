import { describe, expect, it } from 'vitest'
import { recalculate } from '@/domain/stats/recalculate'
import { toGameId, toSeasonId } from '@/domain/types'
import {
  A,
  B,
  C,
  D,
  E,
  F,
  G,
  H,
  TEMPORADA_CERRADA_SEASON_ID,
  TEMPORADA_COMPLETA_GAMES,
  TEMPORADA_COMPLETA_SEASON_ID,
} from '@/__tests__/fixtures/temporadaCompleta'
import { finalizedGame } from '@/test-utils/games'

describe('T55 · recalculate idempotente', () => {
  describe('idempotencia', () => {
    it('recalcular dos veces las mismas partidas devuelve el mismo resultado', () => {
      const first = recalculate(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)
      const second = recalculate(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

      expect(second).toStrictEqual(first)
    })
  })

  it('solo entran partidas finalized', () => {
    const output = recalculate(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(output.stats.map((entry) => entry.playerId)).toStrictEqual([A, B, C, D])
    expect(output.rankings.map((entry) => entry.playerId)).toStrictEqual([A, B, C, D])
  })

  it('la clasificación sale ordenada por la puntuación con uma', () => {
    const output = recalculate(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(output.rankings).toStrictEqual([
      { playerId: A, playerName: 'Jugador A', points: 56560, victories: 2, seconds: 0, rank: 1 },
      { playerId: B, playerName: 'Jugador B', points: 50500, victories: 0, seconds: 1, rank: 2 },
      { playerId: C, playerName: 'Jugador C', points: 47500, victories: 0, seconds: 1, rank: 3 },
      { playerId: D, playerName: 'Jugador D', points: 35440, victories: 0, seconds: 0, rank: 4 },
    ])
  })

  it('una temporada cerrada sigue calculando sus partidas finalizadas', () => {
    const output = recalculate(TEMPORADA_CERRADA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(
      output.rankings.map((entry) => [entry.playerId, entry.points, entry.rank]),
    ).toStrictEqual([
      [G, 26030, 1],
      [H, 24010, 2],
    ])
  })

  it('una partida finalizada sin temporada no entra en ningún recálculo', () => {
    const tem1 = recalculate(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)
    const tem2 = recalculate(TEMPORADA_CERRADA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)
    const tem1Ids = tem1.rankings.map((entry) => entry.playerId)
    const tem2Ids = tem2.rankings.map((entry) => entry.playerId)

    expect(tem1Ids).not.toContain(E)
    expect(tem1Ids).not.toContain(F)
    expect(tem2Ids).not.toContain(E)
    expect(tem2Ids).not.toContain(F)
  })

  it('el nombre del ranking es el desnormalizado del resultado finalizado', () => {
    const output = recalculate(TEMPORADA_COMPLETA_SEASON_ID, TEMPORADA_COMPLETA_GAMES)

    expect(output.rankings[0]?.playerName).toBe('Jugador A')
  })

  it('un jugador sin nombre en el resultado queda con nombre vacío en el ranking', () => {
    const season = toSeasonId('sinNombre')
    const game = finalizedGame(toGameId('sinNombre'), season, [
      { playerId: A, name: '', score: 25000 },
    ])
    const output = recalculate(season, [game])

    expect(output.rankings[0]?.playerName).toBe('')
    expect(output.rankings[0]?.playerId).toBe(A)
  })
})
