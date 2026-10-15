import { describe, expect, it } from 'vitest'
import { buildRanking } from '@/domain/ranking'
import type { RankablePlayer, RankedPlayer } from '@/domain/ranking'
import { toPlayerId } from '@/domain/types'
import type { PlayerId } from '@/domain/types'

const A = toPlayerId('a')
const B = toPlayerId('b')
const C = toPlayerId('c')

function ranked(
  playerId: PlayerId,
  playerName: string,
  points: number,
  victories = 0,
  seconds = 0,
): RankablePlayer {
  return { playerId, playerName, points, victories, seconds }
}

function playerNames(entries: readonly RankedPlayer[]): readonly string[] {
  return entries.map((entry) => entry.playerName)
}

describe('T54 · clasificación', () => {
  it('ordena por la puntuación acumulada con uma, de mayor a menor', () => {
    const rankings = buildRanking([
      ranked(B, 'Bruno', 120),
      ranked(C, 'Clara', 80),
      ranked(A, 'Ana', 150),
    ])

    expect(rankings.map((entry) => entry.playerId)).toStrictEqual([A, B, C])
    expect(rankings.map((entry) => entry.rank)).toStrictEqual([1, 2, 3])
  })

  it('devuelve la clasificación vacía sin partidas finalizadas', () => {
    expect(buildRanking([])).toStrictEqual([])
  })

  it('asigna una posición correlativa sin huecos', () => {
    const rankings = buildRanking([
      ranked(C, 'Clara', 70),
      ranked(A, 'Ana', 90),
      ranked(B, 'Bruno', 90),
    ])

    expect(rankings.map((entry) => entry.rank)).toStrictEqual([1, 2, 3])
    expect(rankings.map((entry) => entry.playerId)).toStrictEqual([A, B, C])
  })
})

describe('T56 · desempate', () => {
  it('desempata por victorias', () => {
    const rankings = buildRanking([
      ranked(C, 'Clara', 100, 1),
      ranked(B, 'Bruno', 100, 2),
      ranked(A, 'Ana', 100, 0),
    ])

    expect(rankings.map((entry) => entry.playerId)).toStrictEqual([B, C, A])
  })

  it('luego por segundas posiciones', () => {
    const rankings = buildRanking([
      ranked(C, 'Clara', 100, 1, 2),
      ranked(B, 'Bruno', 100, 1, 4),
      ranked(A, 'Ana', 100, 1, 1),
    ])

    expect(rankings.map((entry) => entry.playerId)).toStrictEqual([B, C, A])
  })

  it('y por último por orden alfabético del nombre', () => {
    const ana = ranked(A, 'Ana', 100, 1, 1)
    const bruno = ranked(B, 'Bruno', 100, 1, 1)
    const clara = ranked(C, 'Clara', 100, 1, 1)

    expect(playerNames(buildRanking([clara, bruno, ana]))).toStrictEqual(['Ana', 'Bruno', 'Clara'])
    expect(playerNames(buildRanking([ana, bruno, clara]))).toStrictEqual(['Ana', 'Bruno', 'Clara'])
  })

  it('dos jugadores empatados en todo dan un orden independiente del orden de entrada', () => {
    const ana = ranked(A, 'Ana', 0, 0, 0)
    const bruno = ranked(B, 'Ana', 0, 0, 0)

    expect(buildRanking([ana, bruno])).toStrictEqual(buildRanking([bruno, ana]))
    expect(buildRanking([ana, bruno]).map((entry) => entry.playerId)).toStrictEqual([A, B])
  })
})
