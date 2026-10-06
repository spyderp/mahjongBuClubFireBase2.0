import { describe, expect, it } from 'vitest'
import { checkSquare, resolveTurn } from '@/domain/turn'
import type {
  PlayerDelta,
  TurnBase,
  TurnInput,
  TurnPlayer,
  TurnResolution,
  TurnWinnerInput,
} from '@/domain/turn'
import type { HandValueInput } from '@/domain/handValue'
import { toPlayerId } from '@/domain/types'
import type { PlayerId } from '@/domain/types'

const A = toPlayerId('a')
const B = toPlayerId('b')
const C = toPlayerId('c')
const D = toPlayerId('d')

const HAND_1: HandValueInput = { yaku: ['tanyao'], yakuHan: 1, doraCount: 0, fu: 30 }
const HAND_2: HandValueInput = { yaku: ['tanyao'], yakuHan: 2, doraCount: 0, fu: 30 }
const HAND_MANGAN: HandValueInput = { yaku: ['tanyao'], yakuHan: 3, doraCount: 0, fu: 70 }

function table(
  scores: readonly [number, number, number, number] = [25000, 25000, 25000, 25000],
): readonly TurnPlayer[] {
  return [
    { playerId: A, seat: 'east', score: scores[0] },
    { playerId: B, seat: 'south', score: scores[1] },
    { playerId: C, seat: 'west', score: scores[2] },
    { playerId: D, seat: 'north', score: scores[3] },
  ]
}

function base(overrides?: Partial<TurnBase>): TurnBase {
  return {
    players: overrides?.players ?? table(),
    honba: overrides?.honba ?? 0,
    riichiDeclaredBy: overrides?.riichiDeclaredBy ?? [],
    riichiSticksBefore: overrides?.riichiSticksBefore ?? 0,
  }
}

function win(playerId: PlayerId, hand: HandValueInput): TurnWinnerInput {
  return { playerId, hand }
}

function tsumoInput(winners: readonly TurnWinnerInput[], overrides?: Partial<TurnBase>): TurnInput {
  return { resultType: 'tsumo', winners, ...base(overrides) }
}

function ronInput(
  winners: readonly TurnWinnerInput[],
  discarderId: PlayerId,
  overrides?: Partial<TurnBase>,
): TurnInput {
  return { resultType: 'ron', winners, discarderId, ...base(overrides) }
}

function drawInput(
  tenpai: readonly PlayerId[],
  overrides?: Partial<TurnBase>,
  isExtension = false,
): TurnInput {
  return isExtension
    ? { resultType: 'ryuukyoku', tenpai, isExtension: true, ...base(overrides) }
    : { resultType: 'ryuukyoku', tenpai, ...base(overrides) }
}

function chomboInput(chomboId: PlayerId, overrides?: Partial<TurnBase>): TurnInput {
  return { resultType: 'chombo', chomboId, ...base(overrides) }
}

function resolve(input: TurnInput): TurnResolution {
  const result = resolveTurn(input)

  if (!result.ok) {
    throw new Error(`turno rechazado inesperadamente: ${result.reason}`)
  }

  return result.resolution
}

function move(playerId: PlayerId, delta: number): PlayerDelta {
  return { playerId, delta }
}

describe('T24 · resolución de un tsumo', () => {
  it('un tsumo de 1 han 30 fu de no dealer reparte 300 de cada uno y 500 del dealer', () => {
    const resolution = resolve(tsumoInput([win(B, HAND_1)]))

    expect(resolution.deltas).toStrictEqual([
      move(A, -500),
      move(B, 1100),
      move(C, -300),
      move(D, -300),
    ])
    expect(resolution.values).toStrictEqual([
      {
        playerId: B,
        han: 1,
        fu: 30,
        basicPoints: 240,
        points: 1100,
        deltas: [move(A, -500), move(B, 1100), move(C, -300), move(D, -300)],
      },
    ])
    expect(resolution.riichiSticks).toBe(0)
    expect(resolution.bankrupt).toBe(false)
    expect(resolution.bankruptPlayerId).toBeNull()
    expect(resolution.bankruptBalance).toBeNull()
  })

  it('un tsumo de 1 han 30 fu de dealer paga 500 de cada uno y cobra 1500', () => {
    const resolution = resolve(tsumoInput([win(A, HAND_1)]))

    expect(resolution.deltas).toStrictEqual([
      move(A, 1500),
      move(B, -500),
      move(C, -500),
      move(D, -500),
    ])
    expect(resolution.values).toStrictEqual([
      {
        playerId: A,
        han: 1,
        fu: 30,
        basicPoints: 240,
        points: 1500,
        deltas: [move(A, 1500), move(B, -500), move(C, -500), move(D, -500)],
      },
    ])
  })

  it('el honba se reparte en los deltas del tsumo', () => {
    const resolution = resolve(tsumoInput([win(B, HAND_1)], { honba: 1 }))

    expect(resolution.deltas).toStrictEqual([
      move(A, -600),
      move(B, 1400),
      move(C, -400),
      move(D, -400),
    ])
  })
})

describe('T25 · resolución de un ron simple', () => {
  it('el descartador paga el valor íntegro y los demás no se mueven', () => {
    const resolution = resolve(ronInput([win(B, HAND_1)], C))

    expect(resolution.deltas).toStrictEqual([move(B, 1000), move(C, -1000)])
    expect(resolution.values).toStrictEqual([
      {
        playerId: B,
        han: 1,
        fu: 30,
        basicPoints: 240,
        points: 1000,
        deltas: [move(B, 1000), move(C, -1000)],
      },
    ])
  })

  it('un ron de dealer de 1 han 30 fu mueve 1500', () => {
    const resolution = resolve(ronInput([win(A, HAND_1)], D))

    expect(resolution.deltas).toStrictEqual([move(A, 1500), move(D, -1500)])
  })
})

describe('T26 · ron múltiple', () => {
  it('con dos ganadores cada uno cobra su mano íntegra y el descartador paga la suma', () => {
    const resolution = resolve(ronInput([win(B, HAND_1), win(C, HAND_2)], D))

    expect(resolution.deltas).toStrictEqual([move(B, 1000), move(C, 2000), move(D, -3000)])
    expect(resolution.values).toStrictEqual([
      {
        playerId: B,
        han: 1,
        fu: 30,
        basicPoints: 240,
        points: 1000,
        deltas: [move(B, 1000), move(D, -1000)],
      },
      {
        playerId: C,
        han: 2,
        fu: 30,
        basicPoints: 480,
        points: 2000,
        deltas: [move(C, 2000), move(D, -2000)],
      },
    ])
  })

  it('con tres ganadores el descartador carga la suma de las tres manos', () => {
    const resolution = resolve(ronInput([win(B, HAND_1), win(C, HAND_2), win(D, HAND_1)], A))

    expect(resolution.deltas).toStrictEqual([
      move(A, -4000),
      move(B, 1000),
      move(C, 2000),
      move(D, 1000),
    ])
  })

  it('cuatro ganadores en un mismo ron se rechazan por imposibles', () => {
    const result = resolveTurn(
      ronInput([win(A, HAND_1), win(B, HAND_1), win(C, HAND_1), win(D, HAND_1)], A),
    )

    expect(result).toStrictEqual({ ok: false, reason: 'moreThanThreeWinners' })
  })
})

describe('T27 · suufon renta', () => {
  it('los cuatro cobran por tsumo con su localía y nadie paga a un descartador', () => {
    const resolution = resolve(
      tsumoInput([win(A, HAND_MANGAN), win(B, HAND_1), win(C, HAND_1), win(D, HAND_1)]),
    )

    expect(resolution.deltas).toStrictEqual([
      move(A, 10500),
      move(B, -3500),
      move(C, -3500),
      move(D, -3500),
    ])
    expect(resolution.values.map((value) => value.points)).toStrictEqual([12000, 1100, 1100, 1100])
  })

  it('cada ganador recibe en sus deltas lo que paga y lo que cobra', () => {
    const resolution = resolve(
      tsumoInput([win(A, HAND_MANGAN), win(B, HAND_1), win(C, HAND_1), win(D, HAND_1)]),
    )

    expect(resolution.values.map((value) => value.deltas)).toStrictEqual([
      [move(A, 12000), move(B, -4000), move(C, -4000), move(D, -4000)],
      [move(A, -500), move(B, 1100), move(C, -300), move(D, -300)],
      [move(A, -500), move(B, -300), move(C, 1100), move(D, -300)],
      [move(A, -500), move(B, -300), move(C, -300), move(D, 1100)],
    ])
  })
})

describe('T28 · empate con reparto de tenpai', () => {
  it('un no tenpai y tres tenpai reparten 1000 para cada tenpai', () => {
    const resolution = resolve(drawInput([B, C, D]))

    expect(resolution.deltas).toStrictEqual([
      move(A, -3000),
      move(B, 1000),
      move(C, 1000),
      move(D, 1000),
    ])
    expect(resolution.values).toStrictEqual([])
  })

  it('un solo tenpai cobra los 3000', () => {
    const resolution = resolve(drawInput([B]))

    expect(resolution.deltas).toStrictEqual([
      move(A, -1000),
      move(B, 3000),
      move(C, -1000),
      move(D, -1000),
    ])
  })

  it('dos tenpai cobran 1500 cada uno', () => {
    const resolution = resolve(drawInput([C, D]))

    expect(resolution.deltas).toStrictEqual([
      move(A, -1500),
      move(B, -1500),
      move(C, 1500),
      move(D, 1500),
    ])
  })

  it('con todos en tenpai nadie paga ni cobra', () => {
    const resolution = resolve(drawInput([A, B, C, D]))

    expect(resolution.deltas).toStrictEqual([])
  })

  it('con ningún tenpai nadie paga ni cobra', () => {
    const resolution = resolve(drawInput([]))

    expect(resolution.deltas).toStrictEqual([])
  })
})

describe('T29 · prórroga con reparto de 1000', () => {
  it('un no tenpai y tres tenpai desplazan 1000 a cada tenpai', () => {
    const resolution = resolve(drawInput([B, C, D], undefined, true))

    expect(resolution.deltas).toStrictEqual([
      move(A, -3000),
      move(B, 1000),
      move(C, 1000),
      move(D, 1000),
    ])
  })

  it('un solo tenpai recibe 1000 de cada no tenpai', () => {
    const resolution = resolve(drawInput([B], undefined, true))

    expect(resolution.deltas).toStrictEqual([
      move(A, -1000),
      move(B, 3000),
      move(C, -1000),
      move(D, -1000),
    ])
  })

  it('dos y dos: cada no tenpai paga 2000 y cada tenpai cobra 2000', () => {
    const resolution = resolve(drawInput([C, D], undefined, true))

    expect(resolution.deltas).toStrictEqual([
      move(A, -2000),
      move(B, -2000),
      move(C, 2000),
      move(D, 2000),
    ])
  })
})

describe('T30 · declaración de riichi', () => {
  it('declarar riichi resta 1000 al declarante, sube el bote a 1000 y nadie lo recibe', () => {
    const resolution = resolve(drawInput([A, B, C, D], { riichiDeclaredBy: [B] }))

    expect(resolution.deltas).toStrictEqual([move(B, -1000)])
    expect(resolution.riichiSticks).toBe(1)
  })

  it('los cuatro declaran riichi: cuatro fichas al bote y 1000 menos a cada uno', () => {
    const resolution = resolve(drawInput([A, B, C, D], { riichiDeclaredBy: [A, B, C, D] }))

    expect(resolution.deltas).toStrictEqual([
      move(A, -1000),
      move(B, -1000),
      move(C, -1000),
      move(D, -1000),
    ])
    expect(resolution.riichiSticks).toBe(4)
  })
})

describe('T31 · reclamación del bote', () => {
  it('el tsumo se lleva el bote entero en un único delta', () => {
    const resolution = resolve(tsumoInput([win(B, HAND_1)], { riichiSticksBefore: 2 }))

    expect(resolution.deltas).toStrictEqual([
      move(A, -500),
      move(B, 3100),
      move(C, -300),
      move(D, -300),
    ])
    expect(resolution.values[0]?.deltas).toStrictEqual([
      move(A, -500),
      move(B, 3100),
      move(C, -300),
      move(D, -300),
    ])
    expect(resolution.riichiSticks).toBe(0)
  })

  it('un ron con la ficha del propio turno se lleva el bote íntegro', () => {
    const resolution = resolve(
      ronInput([win(B, HAND_1)], C, { riichiDeclaredBy: [B], riichiSticksBefore: 1 }),
    )

    expect(resolution.deltas).toStrictEqual([move(B, 2000), move(C, -1000)])
    expect(resolution.riichiSticks).toBe(0)
  })

  it('en el empate el bote no se mueve y suma las fichas declaradas', () => {
    const resolution = resolve(
      drawInput([A, B, C, D], { riichiDeclaredBy: [B], riichiSticksBefore: 3 }),
    )

    expect(resolution.deltas).toStrictEqual([move(B, -1000)])
    expect(resolution.riichiSticks).toBe(4)
  })
})

describe('T32 · bote en ron múltiple', () => {
  it('con dos manos distintas el bote entero va al de mayor valor', () => {
    const resolution = resolve(
      ronInput([win(B, HAND_1), win(C, HAND_2)], D, { riichiSticksBefore: 1 }),
    )

    expect(resolution.deltas).toStrictEqual([move(B, 1000), move(C, 3000), move(D, -3000)])
    expect(resolution.values[1]?.deltas).toStrictEqual([move(C, 3000), move(D, -2000)])
    expect(resolution.riichiSticks).toBe(0)
  })

  it('con manos iguales el bote va al de menor asiento', () => {
    const resolution = resolve(
      ronInput([win(B, HAND_1), win(D, HAND_1)], C, { riichiSticksBefore: 1 }),
    )

    expect(resolution.deltas).toStrictEqual([move(B, 2000), move(C, -2000), move(D, 1000)])
    expect(resolution.riichiSticks).toBe(0)
  })
})

describe('T33 · chombo', () => {
  it('el chombo asigna −8000 al que abandona sin saldo para nadie más', () => {
    const resolution = resolve(chomboInput(C))

    expect(resolution.deltas).toStrictEqual([move(C, -8000)])
    expect(resolution.values).toStrictEqual([])
    expect(resolution.bankrupt).toBe(false)
  })

  it('el chombo no interrumpe la partida: el turno se resuelve con normalidad', () => {
    const result = resolveTurn(chomboInput(C))

    expect(result.ok).toBe(true)
    expect(result).toMatchObject({ resolution: { riichiSticks: 0, bankrupt: false } })
  })

  it('un chombo con riichi declarado aplica ambas penalizaciones', () => {
    const resolution = resolve(chomboInput(C, { riichiDeclaredBy: [B] }))

    expect(resolution.deltas).toStrictEqual([move(B, -1000), move(C, -8000)])
    expect(resolution.riichiSticks).toBe(1)
  })
})

type SweepScenario = {
  readonly name: string
  readonly chombos: number
  readonly isWin: boolean
  readonly build: (riichi: readonly PlayerId[], potBefore: number) => TurnInput
}

const RIICHI_OPTIONS: readonly (readonly PlayerId[])[] = [[], [B], [A, B]]
const POT_OPTIONS = [0, 1]

const SWEEP_SCENARIOS: readonly SweepScenario[] = [
  {
    name: 'tsumo del dealer',
    chombos: 0,
    isWin: true,
    build: (riichi, potBefore) =>
      tsumoInput([win(A, HAND_1)], { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'tsumo de no dealer',
    chombos: 0,
    isWin: true,
    build: (riichi, potBefore) =>
      tsumoInput([win(B, HAND_1)], { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'suufon renta',
    chombos: 0,
    isWin: true,
    build: (riichi, potBefore) =>
      tsumoInput([win(A, HAND_MANGAN), win(B, HAND_1), win(C, HAND_1), win(D, HAND_1)], {
        riichiDeclaredBy: riichi,
        riichiSticksBefore: potBefore,
      }),
  },
  {
    name: 'ron del dealer',
    chombos: 0,
    isWin: true,
    build: (riichi, potBefore) =>
      ronInput([win(A, HAND_1)], D, { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'ron simple',
    chombos: 0,
    isWin: true,
    build: (riichi, potBefore) =>
      ronInput([win(B, HAND_1)], C, { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'doble ron',
    chombos: 0,
    isWin: true,
    build: (riichi, potBefore) =>
      ronInput([win(B, HAND_1), win(C, HAND_2)], D, {
        riichiDeclaredBy: riichi,
        riichiSticksBefore: potBefore,
      }),
  },
  {
    name: 'triple ron',
    chombos: 0,
    isWin: true,
    build: (riichi, potBefore) =>
      ronInput([win(B, HAND_1), win(C, HAND_2), win(D, HAND_1)], A, {
        riichiDeclaredBy: riichi,
        riichiSticksBefore: potBefore,
      }),
  },
  {
    name: 'empate con un tenpai',
    chombos: 0,
    isWin: false,
    build: (riichi, potBefore) =>
      drawInput([B], { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'empate con tres tenpai',
    chombos: 0,
    isWin: false,
    build: (riichi, potBefore) =>
      drawInput([B, C, D], { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'empate sin tenpai',
    chombos: 0,
    isWin: false,
    build: (riichi, potBefore) =>
      drawInput([], { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'empate con todos tenpai',
    chombos: 0,
    isWin: false,
    build: (riichi, potBefore) =>
      drawInput([A, B, C, D], { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
  {
    name: 'prórroga',
    chombos: 0,
    isWin: false,
    build: (riichi, potBefore) =>
      drawInput([C, D], { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }, true),
  },
  {
    name: 'chombo',
    chombos: 1,
    isWin: false,
    build: (riichi, potBefore) =>
      chomboInput(C, { riichiDeclaredBy: riichi, riichiSticksBefore: potBefore }),
  },
]

describe('T34 · invariante de cuadre', () => {
  it('todas las combinaciones cuadran con Σ deltas = −1000 × (riichi − reclamados) − 8000 × chombos', () => {
    const failures: string[] = []
    let checked = 0

    for (const riichi of RIICHI_OPTIONS) {
      for (const potBefore of POT_OPTIONS) {
        for (const scenario of SWEEP_SCENARIOS) {
          const resolution = resolve(scenario.build(riichi, potBefore))
          const square = checkSquare({
            deltas: resolution.deltas,
            riichiDeclared: riichi.length,
            riichiClaimed: scenario.isWin ? potBefore + riichi.length : 0,
            chombos: scenario.chombos,
          })

          checked += 1

          if (!square.ok) {
            failures.push(
              `${scenario.name} · riichi ${riichi.length} · bote ${potBefore}: ` +
                `esperaba ${square.expected} y suma ${square.actual}`,
            )
          }
        }
      }
    }

    expect(checked).toBe(78)
    expect(failures).toStrictEqual([])
  })

  it('una suma que no cumple la fórmula se rechaza con el esperado y el real', () => {
    expect(
      checkSquare({
        deltas: [move(B, -500)],
        riichiDeclared: 1,
        riichiClaimed: 0,
        chombos: 0,
      }),
    ).toStrictEqual({ ok: false, expected: -1000, actual: -500 })
  })
})

describe('T35 · detección de bancarrota', () => {
  it('un chombo que deja a alguien bajo cero se aplica íntegro y devuelve el saldo negativo', () => {
    const resolution = resolve(chomboInput(C, { players: table([25000, 25000, 7000, 25000]) }))

    expect(resolution.deltas).toStrictEqual([move(C, -8000)])
    expect(resolution.bankrupt).toBe(true)
    expect(resolution.bankruptPlayerId).toBe(C)
    expect(resolution.bankruptBalance).toBe(-1000)
  })

  it('un ron que deja al descartador bajo cero se aplica íntegro', () => {
    const resolution = resolve(
      ronInput([win(B, HAND_1)], C, { players: table([25000, 25000, 500, 25000]) }),
    )

    expect(resolution.deltas).toStrictEqual([move(B, 1000), move(C, -1000)])
    expect(resolution.bankrupt).toBe(true)
    expect(resolution.bankruptPlayerId).toBe(C)
    expect(resolution.bankruptBalance).toBe(-500)
  })

  it('un turno que deja a todos en positivo no es bancarrota', () => {
    const resolution = resolve(chomboInput(C))

    expect(resolution.bankrupt).toBe(false)
    expect(resolution.bankruptPlayerId).toBeNull()
    expect(resolution.bankruptBalance).toBeNull()
  })
})
