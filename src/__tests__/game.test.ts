import { describe, expect, it } from 'vitest'
import {
  computes,
  daysSinceActivity,
  finalizeResults,
  offersAbandon,
  playerScore,
  transition,
} from '@/domain/game'
import type { FinalizablePlayer, GameAction, GameTransitionInput } from '@/domain/game'
import { resolveTurn } from '@/domain/turn'
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
import type { GameStatus, PlayerId, Seat, Timestamp } from '@/domain/types'

const START_POINTS = 25000
const DAY_IN_SECONDS = 86400

const A = toPlayerId('a')
const B = toPlayerId('b')
const C = toPlayerId('c')
const D = toPlayerId('d')

const HAND_1: HandValueInput = { yaku: ['tanyao'], yakuHan: 1, doraCount: 0, fu: 30 }

function table(
  scores: readonly [number, number, number, number] = [
    START_POINTS,
    START_POINTS,
    START_POINTS,
    START_POINTS,
  ],
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
    dealerId: overrides?.dealerId ?? A,
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

function seatOf(playerId: PlayerId): Seat {
  switch (playerId) {
    case A:
      return 'east'
    case B:
      return 'south'
    case C:
      return 'west'
    case D:
      return 'north'
    default:
      return 'east'
  }
}

type StandingFlags = { readonly chombo?: boolean; readonly bankrupt?: boolean }

function finalizable(
  playerId: PlayerId,
  score: number,
  flags: StandingFlags = {},
): FinalizablePlayer {
  return {
    playerId,
    seat: seatOf(playerId),
    score,
    chombo: flags.chombo ?? false,
    bankrupt: flags.bankrupt ?? false,
  }
}

function standings(
  scores: readonly [number, number, number, number] = [
    START_POINTS,
    START_POINTS,
    START_POINTS,
    START_POINTS,
  ],
): readonly FinalizablePlayer[] {
  return [
    finalizable(A, scores[0]),
    finalizable(B, scores[1]),
    finalizable(C, scores[2]),
    finalizable(D, scores[3]),
  ]
}

function machine(
  status: GameStatus,
  overrides: Partial<GameTransitionInput> = {},
): GameTransitionInput {
  return {
    status,
    mustFinalize: overrides.mustFinalize ?? false,
    turnCount: overrides.turnCount ?? 4,
    gameLength: overrides.gameLength ?? 'tonpuusen',
    idleDays: overrides.idleDays ?? 0,
  }
}

function atDay(day: number): Timestamp {
  return { seconds: day * DAY_IN_SECONDS, nanoseconds: 0 }
}

describe('T40 · puntuación final con uma', () => {
  it('la puntuación final es marcador + uma en el orden de posiciones', () => {
    const results = finalizeResults(standings([22000, 30000, 25000, 18000]))

    expect(results).toStrictEqual([
      {
        playerId: B,
        seat: 'south',
        score: 30000,
        chombo: false,
        bankrupt: false,
        position: '1st',
        uma: 30,
        finalScore: 30030,
      },
      {
        playerId: C,
        seat: 'west',
        score: 25000,
        chombo: false,
        bankrupt: false,
        position: '2nd',
        uma: 10,
        finalScore: 25010,
      },
      {
        playerId: A,
        seat: 'east',
        score: 22000,
        chombo: false,
        bankrupt: false,
        position: '3rd',
        uma: -10,
        finalScore: 21990,
      },
      {
        playerId: D,
        seat: 'north',
        score: 18000,
        chombo: false,
        bankrupt: false,
        position: '4th',
        uma: -30,
        finalScore: 17970,
      },
    ])
  })

  it('la suma de las umas de una partida es 0', () => {
    const results = finalizeResults(standings([22000, 30000, 25000, 18000]))
    const umaTotal = results.reduce((total, result) => total + result.uma, 0)

    expect(umaTotal).toBe(0)
  })
})

describe('T41 · posiciones y desempate por asiento', () => {
  it('a igual marcador gana el asiento más próximo al Este', () => {
    const results = finalizeResults(standings([20000, 20000, 30000, 10000]))

    expect(results.map((result) => result.playerId)).toStrictEqual([C, A, B, D])
  })

  it('con los cuatro empatados el orden es Este, Sur, Oeste y Norte', () => {
    const results = finalizeResults(standings())

    expect(results.map((result) => result.playerId)).toStrictEqual([A, B, C, D])
  })

  it('las cuatro posiciones se asignan sin huecos', () => {
    const positions = finalizeResults(standings([20000, 20000, 30000, 10000])).map(
      (result) => result.position,
    )

    expect(positions).toStrictEqual(['1st', '2nd', '3rd', '4th'])
  })
})

describe('T42 · máquina de estados del juego', () => {
  it('capturar un turno se rechaza en finalized, unfinished y aborted', () => {
    const failures: string[] = []

    for (const status of ['finalized', 'unfinished', 'aborted'] as const) {
      const result = transition('capture', machine(status))

      if (result.ok) {
        failures.push(`${status}: captura aceptada`)
      } else if (result.reason !== 'notOpen') {
        failures.push(`${status}: ${result.reason}`)
      }
    }

    expect(failures).toStrictEqual([])
  })

  it('en una partida abierta la captura de turno no cambia el estado', () => {
    expect(transition('capture', machine('open'))).toStrictEqual({ ok: true, status: 'open' })
  })
})

describe('T43 · transiciones y estados terminales', () => {
  const terminalStates: readonly GameStatus[] = ['unfinished', 'aborted']
  const actions: readonly GameAction[] = ['capture', 'finalize', 'abandon']

  it('los estados terminales no tienen transición de salida', () => {
    const failures: string[] = []

    for (const status of terminalStates) {
      for (const action of actions) {
        const result = transition(action, machine(status))

        if (result.ok) {
          failures.push(`${status} + ${action}: aceptada`)
        } else if (result.reason !== 'notOpen') {
          failures.push(`${status} + ${action}: ${result.reason}`)
        }
      }
    }

    expect(failures).toStrictEqual([])
  })

  it('solo la partida finalizada computa en el ranking', () => {
    const failures: string[] = []

    for (const status of ['open', 'finalized', 'unfinished', 'aborted'] as const) {
      const expected = status === 'finalized'

      if (computes(status) !== expected) {
        failures.push(`${status}: computes=${computes(status)}`)
      }
    }

    expect(failures).toStrictEqual([])
  })

  it('finalizar una partida abierta sin el mínimo de turnos la aborta', () => {
    expect(transition('finalize', machine('open', { turnCount: 3 }))).toStrictEqual({
      ok: true,
      status: 'aborted',
    })
  })
})

describe('T44 · cierre obligatorio por bancarrota', () => {
  it('con mustFinalize activo capturar un turno se rechaza', () => {
    expect(transition('capture', machine('open', { mustFinalize: true }))).toStrictEqual({
      ok: false,
      reason: 'mustFinalize',
    })
  })

  it('con mustFinalize activo abandonar tampoco está permitido', () => {
    expect(transition('abandon', machine('open', { mustFinalize: true }))).toStrictEqual({
      ok: false,
      reason: 'mustFinalize',
    })
  })

  it('con mustFinalize activo la única salida es finalizar, aunque falten turnos', () => {
    expect(
      transition('finalize', machine('open', { mustFinalize: true, turnCount: 0 })),
    ).toStrictEqual({ ok: true, status: 'finalized' })
  })
})

describe('T45 · regla de los 7 días', () => {
  it('los días sin actividad se leen como días naturales, no horas', () => {
    expect(daysSinceActivity(atDay(0), atDay(6))).toBe(6)
    expect(daysSinceActivity(atDay(0), atDay(7))).toBe(7)
    expect(daysSinceActivity(atDay(0), atDay(8))).toBe(8)
    expect(daysSinceActivity(atDay(0), { seconds: 8 * DAY_IN_SECONDS - 1, nanoseconds: 0 })).toBe(7)
  })

  it('el abandono solo se ofrece pasados 7 días completos', () => {
    expect(offersAbandon(atDay(0), atDay(6))).toBe(false)
    expect(offersAbandon(atDay(0), atDay(7))).toBe(false)
    expect(offersAbandon(atDay(0), atDay(8))).toBe(true)
  })

  it('abandonar antes de los 7 días se rechaza y después termina en unfinished', () => {
    expect(transition('abandon', machine('open', { idleDays: 6 }))).toStrictEqual({
      ok: false,
      reason: 'idleDaysNotPassed',
    })
    expect(transition('abandon', machine('open', { idleDays: 8 }))).toStrictEqual({
      ok: true,
      status: 'unfinished',
    })
  })
})

describe('T46 · resultado final con chombo y bancarrota', () => {
  const turns: readonly (readonly PlayerDelta[])[] = [
    resolve(chomboInput(C)).deltas,
    resolve(tsumoInput([win(A, HAND_1)])).deltas,
    resolve(ronInput([win(B, HAND_1)], D)).deltas,
    resolve(drawInput([A, B, C, D])).deltas,
  ]

  it('los marcadores se acumulan desde 25 000 y una partida con un chombo conserva los 100 000', () => {
    const scoreA = playerScore(A, START_POINTS, turns)
    const scoreB = playerScore(B, START_POINTS, turns)
    const scoreC = playerScore(C, START_POINTS, turns)
    const scoreD = playerScore(D, START_POINTS, turns)

    expect(scoreA).toBe(30500)
    expect(scoreB).toBe(27500)
    expect(scoreC).toBe(16500)
    expect(scoreD).toBe(25500)
    expect(scoreA + scoreB + scoreC + scoreD).toBe(100000)
  })

  it('el chombo viaja al resultado y la posición sigue al marcador', () => {
    const results = finalizeResults([
      finalizable(A, playerScore(A, START_POINTS, turns)),
      finalizable(B, playerScore(B, START_POINTS, turns)),
      finalizable(C, playerScore(C, START_POINTS, turns), { chombo: true }),
      finalizable(D, playerScore(D, START_POINTS, turns)),
    ])
    const aResult = results.find((result) => result.playerId === A)
    const cResult = results.find((result) => result.playerId === C)
    const dResult = results.find((result) => result.playerId === D)

    expect(results.map((result) => result.playerId)).toStrictEqual([A, B, D, C])
    expect(aResult?.position).toBe('1st')
    expect(aResult?.finalScore).toBe(30530)
    expect(dResult?.position).toBe('3rd')
    expect(dResult?.finalScore).toBe(25490)
    expect(cResult?.chombo).toBe(true)
    expect(cResult?.finalScore).toBe(16470)
  })

  it('finalizar una partida completa la cierra en finalized y computa', () => {
    expect(transition('finalize', machine('open', { turnCount: 4 }))).toStrictEqual({
      ok: true,
      status: 'finalized',
    })
    expect(computes('finalized')).toBe(true)
  })

  it('un marcador negativo por bancarrota conserva su uma en el punto final', () => {
    const results = finalizeResults([
      finalizable(A, 30000),
      finalizable(B, 26000),
      finalizable(C, 25000),
      finalizable(D, -1000, { bankrupt: true }),
    ])
    const dResult = results.find((result) => result.playerId === D)

    expect(results.map((result) => result.playerId)).toStrictEqual([A, B, C, D])
    expect(dResult?.position).toBe('4th')
    expect(dResult?.bankrupt).toBe(true)
    expect(dResult?.finalScore).toBe(-1030)
  })
})
