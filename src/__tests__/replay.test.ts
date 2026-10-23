import { describe, expect, it } from 'vitest'
import { replayTurns } from '@/domain/replay'
import type { CapturedTurn, ReplayOutcome, ReplayPlayer, ReplayScore } from '@/domain/replay'
import type { HandValueInput } from '@/domain/handValue'
import { toPlayerId } from '@/domain/types'
import type { PlayerId, ResultType } from '@/domain/types'

/**
 * Fixtures locales de `replay.test.ts`. Las partidas completas reutilizables llegan en la fase 7
 * (`plan.md` §6.4); aquí se construyen en línea porque cada caso necesita una secuencia distinta.
 */

const A = toPlayerId('a')
const B = toPlayerId('b')
const C = toPlayerId('c')
const D = toPlayerId('d')

const START_POINTS = 25000

const HAND_1: HandValueInput = { yaku: ['tanyao'], yakuHan: 1, doraCount: 0, fu: 30 }
const HAND_2: HandValueInput = { yaku: ['tanyao'], yakuHan: 2, doraCount: 0, fu: 30 }
const HAND_WITH_ROUND_EAST: HandValueInput = {
  yaku: ['tanyao', 'roundEast'],
  yakuHan: 1,
  doraCount: 0,
  fu: 30,
}

const PLAYERS: readonly ReplayPlayer[] = [
  { playerId: A, seat: 'east', score: START_POINTS },
  { playerId: B, seat: 'south', score: START_POINTS },
  { playerId: C, seat: 'west', score: START_POINTS },
  { playerId: D, seat: 'north', score: START_POINTS },
]

function playersWith(scores: readonly [number, number, number, number]): readonly ReplayPlayer[] {
  const [este, sur, oeste, norte] = scores

  return [
    { playerId: A, seat: 'east', score: este },
    { playerId: B, seat: 'south', score: sur },
    { playerId: C, seat: 'west', score: oeste },
    { playerId: D, seat: 'north', score: norte },
  ]
}

function turn(
  turnNo: number,
  resultType: ResultType,
  extra: Partial<CapturedTurn> = {},
): CapturedTurn {
  return {
    turnNo,
    resultType,
    hand: HAND_1,
    winners: [],
    discarderId: null,
    chomboId: null,
    tenpai: [],
    riichiDeclaredBy: [],
    ...extra,
  }
}

function tsumoTurn(
  turnNo: number,
  winnerId: PlayerId,
  extra: Partial<CapturedTurn> = {},
): CapturedTurn {
  return turn(turnNo, 'tsumo', { winners: [winnerId], ...extra })
}

function ronTurn(
  turnNo: number,
  winnerId: PlayerId,
  discarderId: PlayerId,
  extra: Partial<CapturedTurn> = {},
): CapturedTurn {
  return turn(turnNo, 'ron', { winners: [winnerId], discarderId, ...extra })
}

function drawTurn(
  turnNo: number,
  tenpai: readonly PlayerId[],
  extra: Partial<CapturedTurn> = {},
): CapturedTurn {
  return turn(turnNo, 'ryuukyoku', { tenpai, ...extra })
}

function chomboTurn(
  turnNo: number,
  chomboId: PlayerId,
  extra: Partial<CapturedTurn> = {},
): CapturedTurn {
  return turn(turnNo, 'chombo', { chomboId, ...extra })
}

/**
 * Tsumos encadenados en los que **gana siempre un jugador que no es el dealer**, para que la
 * localía avance sola en cada turno. Con el dealer avanzando, el de cada turno es Este, Sur,
 * Oeste y Norte, y el viento cambia al volver al Este.
 */
function consecutiveWins(count: number): readonly CapturedTurn[] {
  const winners = [B, C, D, A]

  return Array.from({ length: count }, (_unused, index) => {
    const winnerId = winners[index % winners.length]

    if (winnerId === undefined) {
      throw new Error('sin ganador para el turno')
    }

    return tsumoTurn(index + 1, winnerId)
  })
}

function expectOk(result: ReturnType<typeof replayTurns>): ReplayOutcome {
  if (!result.ok) {
    throw new Error(
      `recorrido rechazado inesperadamente: turno ${result.turnNo} · ${result.reason}`,
    )
  }

  return result.outcome
}

function scoreOf(outcome: ReplayOutcome, playerId: PlayerId): number {
  const found: ReplayScore | undefined = outcome.scores.find((entry) => entry.playerId === playerId)

  if (found === undefined) {
    throw new Error(`sin marcador para ${playerId}`)
  }

  return found.score
}

function totalOf(outcome: ReplayOutcome): number {
  return outcome.scores.reduce((total, entry) => total + entry.score, 0)
}

describe('T07 · estado inicial de la partida', () => {
  it('la partida arranca en la ronda del Este, con el Este de localía y honba 0', () => {
    const outcome = expectOk(replayTurns(PLAYERS, [tsumoTurn(1, B)], 1))

    expect(outcome.turns[0]).toMatchObject({ wind: 'east', dealerId: A, honba: 0 })
  })

  it('el primer dealer es quien ocupa el asiento Este, no el primero de la lista', () => {
    const shuffled: readonly ReplayPlayer[] = [
      { playerId: D, seat: 'north', score: START_POINTS },
      { playerId: C, seat: 'west', score: START_POINTS },
      { playerId: A, seat: 'east', score: START_POINTS },
      { playerId: B, seat: 'south', score: START_POINTS },
    ]

    const outcome = expectOk(replayTurns(shuffled, [tsumoTurn(1, B)], 1))

    expect(outcome.turns[0]?.dealerId).toBe(A)
  })
})

/**
 * T34 · RF-23.3 y RF-23.4. El estado que se va a capturar **no** viene del teclado, y la interfaz
 * lo necesita para mostrarlo: sin `nextHand` en el resultado del recorrido, `TurnForm` tendría que
 * volver a recorrer la partida —y a reinventar `nextHand`— para pintar tres valores.
 */
describe('T34 · estado de la mano siguiente', () => {
  it('sin turnos guardados, la mano siguiente es el estado inicial', () => {
    const outcome = expectOk(replayTurns(PLAYERS, [], 1))

    expect(outcome.nextHand).toStrictEqual({ wind: 'east', dealer: 'east', honba: 0 })
  })

  it('con turnos guardados, es el estado que dejaría el último', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(3), 1))

    // Tres manos ganadas por quien no era dealer: la localía avanza y el contador se queda a cero,
    // porque se pierde la localía. El dealer del tercer turno es Oeste y al acabar pasa a Norte.
    expect(outcome.turns.at(-1)).toMatchObject({ wind: 'east', dealerId: C, honba: 0 })
    expect(outcome.nextHand).toStrictEqual({ wind: 'east', dealer: 'north', honba: 0 })
  })

  it('el dealer que conserva la tenpai mantiene la localía y sube el honba', () => {
    const outcome = expectOk(replayTurns(PLAYERS, [drawTurn(1, [A]), drawTurn(2, [A])], 1))

    // Dos renchan del Este: la localía no se mueve y el honba sube en cada una.
    expect(outcome.nextHand).toStrictEqual({ wind: 'east', dealer: 'east', honba: 2 })
  })

  it('el dealer que gana también sube el honba, con la desviación 8', () => {
    const outcome = expectOk(
      replayTurns(PLAYERS, [drawTurn(1, [A]), drawTurn(2, [A]), tsumoTurn(3, A)], 1),
    )

    expect(outcome.nextHand).toStrictEqual({ wind: 'east', dealer: 'east', honba: 3 })
  })

  it('nextHand es el estado del turno siguiente, no una copia del último', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(1), 1))

    expect(outcome.turns[0]).toMatchObject({ dealerId: A, honba: 0 })
    expect(outcome.nextHand).toStrictEqual({ wind: 'east', dealer: 'south', honba: 0 })
  })
})

describe('T08 · recorrido hacia delante', () => {
  it('la localía, el honba y el viento avanzan solos a lo largo de la partida', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(5), 1))

    expect(
      outcome.turns.map((replayed) => [replayed.wind, replayed.dealerId, replayed.honba]),
    ).toStrictEqual([
      ['east', A, 0],
      ['east', B, 0],
      ['east', C, 0],
      ['east', D, 0],
      ['south', A, 0],
    ])
  })

  it('si el dealer gana, conserva la localía y el honba sube', () => {
    const outcome = expectOk(
      replayTurns(PLAYERS, [tsumoTurn(1, A), tsumoTurn(2, A), tsumoTurn(3, B), tsumoTurn(4, C)], 1),
    )

    // Dos renchan seguidos del Este mantienen su localía y suben el contador. El turno 3 lo gana B, que
    // no es dealer, así que la localía avanza y el contador vuelve a cero en el turno siguiente.
    expect(outcome.turns.map((replayed) => [replayed.dealerId, replayed.honba])).toStrictEqual([
      [A, 0],
      [A, 1],
      [A, 2],
      [B, 0],
    ])
  })

  it('si el dealer hace empate y conserva la tenpai, renchan y el honba sube', () => {
    const outcome = expectOk(
      replayTurns(PLAYERS, [drawTurn(1, [A, B, C]), drawTurn(2, [A, B, C]), tsumoTurn(3, C)], 1),
    )

    expect(outcome.turns.map((replayed) => [replayed.dealerId, replayed.honba])).toStrictEqual([
      [A, 0],
      [A, 1],
      [A, 2],
    ])
  })

  it('paga al que ocupa la localía y no al del asiento Este', () => {
    // Turno 1: el Este tiene la localía y no gana, así que la pierde y el contador vuelve a cero.
    // Turno 2: la localía es del Sur y gana el Oeste. Antes de 002 el motor cobraría a C como no dealer.
    const outcome = expectOk(replayTurns(PLAYERS, [tsumoTurn(1, B), tsumoTurn(2, C)], 1))

    expect(outcome.turns[1]?.deltas).toStrictEqual([
      { playerId: A, delta: -300 },
      { playerId: B, delta: -500 },
      { playerId: C, delta: 1100 },
      { playerId: D, delta: -300 },
    ])
  })

  it('un tsumo del dealer de verdad cobra el doble aunque no ocupe el asiento Este', () => {
    const turnos = [tsumoTurn(1, B), tsumoTurn(2, C), tsumoTurn(3, C)]
    const ultimo = expectOk(replayTurns(PLAYERS, turnos, 1)).turns.at(-1)

    // El Oeste tiene la localía en el turno 3, pero el turno 2 lo ganó él mismo sin ser dealer, así que
    // entra con honba 0: 500 de cada uno. Sin la localía real el Este pagaría 500 y los otros 300.
    expect(ultimo?.dealerId).toBe(C)
    expect(ultimo?.deltas.find((delta) => delta.playerId === C)?.delta).toBe(1500)
  })

  it('no muta los turnos que recibe', () => {
    const turns = consecutiveWins(3)
    const copia = structuredClone(turns)

    expectOk(replayTurns(PLAYERS, turns, 2))

    expect(turns).toStrictEqual(copia)
  })

  it('rechaza un desdeTurno anterior al primer turno', () => {
    const result = replayTurns(PLAYERS, consecutiveWins(2), 0)

    expect(result.ok).toBe(false)
  })
})

describe('T09 · recorrido hacia atrás y borrado', () => {
  it('eliminar un turno recalcula también los honba de los que quedan', () => {
    const turnos = consecutiveWins(5)
    const sinTercero = turnos.filter((entry) => entry.turnNo !== 3)

    const borrado = expectOk(replayTurns(PLAYERS, sinTercero, 1))

    // No basta con restar los deltas del turno borrado: los turnos supervivientes cambian de localía y
    // sus pagos con ella. Por eso el borrado tiene que re-derivar y no restar.
    expect(borrado.turns).toHaveLength(4)
    expect(totalOf(borrado)).toBe(100000)
    expect(borrado.turns.map((entry) => [entry.turnNo, entry.dealerId, entry.honba])).toStrictEqual(
      [
        [1, A, 0],
        [2, B, 0],
        [4, C, 0],
        [5, D, 0],
      ],
    )
    expect(borrado.scores).toStrictEqual([
      { playerId: A, score: 25000 },
      { playerId: B, score: 26400 },
      { playerId: C, score: 25000 },
      { playerId: D, score: 23600 },
    ])
  })

  it('eliminar el último turno deja el resto intacto', () => {
    const turnos = consecutiveWins(4)
    const sinUltimo = turnos.slice(0, 3)

    const entero = expectOk(replayTurns(PLAYERS, turnos, 1))
    const borrado = expectOk(replayTurns(PLAYERS, sinUltimo, 1))

    expect(borrado.turns).toStrictEqual(entero.turns.slice(0, 3))
  })

  it('borrar el turno 1 devuelve la partida al estado inicial', () => {
    const soloTercero = [consecutiveWins(3)[2] ?? tsumoTurn(1, A)]

    const borrado = expectOk(replayTurns(PLAYERS, soloTercero, 1))

    expect(borrado.turns[0]).toMatchObject({ wind: 'east', dealerId: A, honba: 0 })
  })

  it('una partida vacía no devuelve turnos y deja los marcadores de salida', () => {
    const outcome = expectOk(replayTurns(PLAYERS, [], 1))

    expect(outcome.turns).toStrictEqual([])
    expect(outcome.scores).toStrictEqual([
      { playerId: A, score: START_POINTS },
      { playerId: B, score: START_POINTS },
      { playerId: C, score: START_POINTS },
      { playerId: D, score: START_POINTS },
    ])
  })
})

describe('T10 · validaciones del recorrido', () => {
  it('un ron sin descartador se rechaza en vez de inventar uno', () => {
    expect(replayTurns(PLAYERS, [ronTurn(1, A, D, { discarderId: null })], 1)).toStrictEqual({
      ok: false,
      turnNo: 1,
      reason: 'incompleteTurn',
    })
  })

  it('un chombo sin abandono se rechaza en vez de penalizar a nadie', () => {
    expect(replayTurns(PLAYERS, [chomboTurn(1, C, { chomboId: null })], 1)).toStrictEqual({
      ok: false,
      turnNo: 1,
      reason: 'incompleteTurn',
    })
  })

  it('una partida sin un asiento para la localía no puede derivarse', () => {
    // Cuatro jugadores pero con dos en el mismo asiento y ninguno en el Norte. Es un dato
    // corrupto, y el recorrido no puede inventar quién es el dealer de esa mano.
    const conAsientoDuplicado: readonly ReplayPlayer[] = [
      { playerId: A, seat: 'east', score: START_POINTS },
      { playerId: B, seat: 'south', score: START_POINTS },
      { playerId: C, seat: 'west', score: START_POINTS },
      { playerId: D, seat: 'west', score: START_POINTS },
    ]
    const turnos = [tsumoTurn(1, B), tsumoTurn(2, C), tsumoTurn(3, A), tsumoTurn(4, A)]

    // Tras tres manos sin renchan la localía le tocaría al asiento Norte, que no está en la mesa.
    expect(() => replayTurns(conAsientoDuplicado, turnos, 1)).toThrow(
      /ningún jugador ocupa el asiento north/,
    )
  })

  it('rechaza un ron con más de tres ganadores', () => {
    const result = replayTurns(PLAYERS, [ronTurn(1, A, B, { winners: [A, B, C, D] })], 1)

    expect(result).toStrictEqual({ ok: false, turnNo: 1, reason: 'turnUnresolvable' })
  })

  it('rechaza cuando un yaku de viento deja de valer al avanzar la ronda', () => {
    // Cuatro manos en las que el dealer no conserva la tenpai devuelven la localía al Este y
    // mueven el viento al Sur para el turno 5. Ahí un yaku de ronda del Este ya no vale para
    // quien no está en el asiento Este, y ese jugador es el que gana.
    const base: readonly CapturedTurn[] = consecutiveWins(4)
    const conYaku: readonly CapturedTurn[] = [
      ...base,
      ronTurn(5, B, D, { hand: HAND_WITH_ROUND_EAST }),
    ]

    expect(expectOk(replayTurns(PLAYERS, base, 1)).turns).toHaveLength(4)

    const result = replayTurns(PLAYERS, conYaku, 1)

    expect(result).toStrictEqual({ ok: false, turnNo: 5, reason: 'windYakuInvalid' })
  })

  it('acepta ese mismo yaku mientras la ronda siga siendo la del Este', () => {
    const turnos: readonly CapturedTurn[] = [
      ...consecutiveWins(2),
      ronTurn(3, B, D, { hand: HAND_WITH_ROUND_EAST }),
    ]

    expect(expectOk(replayTurns(PLAYERS, turnos, 1)).turns).toHaveLength(3)
  })

  it('un yaku de asiento no depende del viento de ronda, sino de quién gana', () => {
    const conEsteEnElEste = ronTurn(1, A, D, {
      hand: { yaku: ['tanyao', 'roundEast'], yakuHan: 1, doraCount: 0, fu: 30 },
    })

    expect(expectOk(replayTurns(PLAYERS, [conEsteEnElEste], 1)).turns).toHaveLength(1)
  })

  it('rechaza un turno que referencia a un jugador que no está en la mesa', () => {
    const fuera = toPlayerId('e')
    const resultado = replayTurns(PLAYERS, [tsumoTurn(1, A, { riichiDeclaredBy: [fuera] })], 1)

    expect(resultado).toStrictEqual({ ok: false, turnNo: 1, reason: 'notSquare' })
  })

  it('no vuelve a comprobar lo que solo depende de campos capturados', () => {
    // 25 fu sin chiitoitsu es irrepresentable y `validateChiitoitsuFu` lo rechaza. Como el fu
    // capturado no ha cambiado, el recorrido no lo vuelve a mirar y la partida avanza.
    const turno = tsumoTurn(1, A, { hand: { yaku: ['tanyao'], yakuHan: 1, doraCount: 0, fu: 25 } })

    expect(expectOk(replayTurns(PLAYERS, [turno], 1)).turns).toHaveLength(1)
  })
})

describe('T11 · marcador y cierre por bancarrota', () => {
  it('devuelve el marcador de los cuatro y su suma', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(4), 1))

    expect(outcome.scores).toHaveLength(4)
    expect(totalOf(outcome)).toBe(100000)
    expect(outcome.mustFinalize).toBe(false)
    expect(outcome.bankruptPlayerId).toBeNull()
  })

  it('levanta el cierre obligatorio cuando un turno deja a alguien por debajo de cero', () => {
    const conBancarrota = replayTurns(
      playersWith([START_POINTS, START_POINTS, 7000, START_POINTS]),
      [chomboTurn(1, C)],
      1,
    )

    const outcome = expectOk(conBancarrota)

    expect(outcome.mustFinalize).toBe(true)
    expect(outcome.bankruptPlayerId).toBe(C)
    expect(scoreOf(outcome, C)).toBe(-1000)
  })

  it('no levanta el cierre obligatorio si el mismo turno sale con saldo sano', () => {
    const outcome = expectOk(replayTurns(PLAYERS, [chomboTurn(1, C)], 1))

    expect(outcome.mustFinalize).toBe(false)
    expect(outcome.bankruptPlayerId).toBeNull()
    expect(scoreOf(outcome, C)).toBe(17000)
  })

  it('el marcador de cada uno acumula exactamente sus deltas', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(3), 1))

    for (const entry of outcome.scores) {
      const acumulado = outcome.turns
        .flatMap((replayed) => replayed.deltas)
        .filter((delta) => delta.playerId === entry.playerId)
        .reduce((total, delta) => total + delta.delta, 0)

      expect(entry.score).toBe(START_POINTS + acumulado)
    }

    expect(totalOf(outcome)).toBe(100000)
  })
})

describe('T12 · reproducción', () => {
  const PARTIDAS: Readonly<Record<string, readonly CapturedTurn[]>> = {
    'todo tsumos': consecutiveWins(6),
    'renchan del dealer': [tsumoTurn(1, A), tsumoTurn(2, A), tsumoTurn(3, A), tsumoTurn(4, A)],
    'empates y tsumos': [
      drawTurn(1, [A, B, C]),
      tsumoTurn(2, C),
      drawTurn(3, [B, C]),
      drawTurn(4, [A, D]),
      tsumoTurn(5, D),
      drawTurn(6, [A, B, C, D]),
    ],
    'ron múltiple': [
      ronTurn(1, A, D, { winners: [A], hand: HAND_1 }),
      ronTurn(2, B, A, { winners: [B, C], hand: HAND_2, discarderId: A }),
      chomboTurn(3, D),
      tsumoTurn(4, C, { riichiDeclaredBy: [D] }),
    ],
    'con riichi acumulado': [
      tsumoTurn(1, A, { riichiDeclaredBy: [B] }),
      drawTurn(2, [A, C], { riichiDeclaredBy: [C] }),
      ronTurn(3, B, D, { riichiDeclaredBy: [B] }),
      drawTurn(4, [A, B], { riichiDeclaredBy: [A] }),
    ],
  }

  for (const [nombre, turnos] of Object.entries(PARTIDAS)) {
    it(`corregir en cualquier posición da el mismo resultado que no corregir: ${nombre}`, () => {
      const entero = expectOk(replayTurns(PLAYERS, turnos, 1))

      for (let desde = 1; desde <= turnos.length; desde += 1) {
        const parcial = expectOk(replayTurns(PLAYERS, turnos, desde))

        expect(parcial.turns).toStrictEqual(entero.turns.filter((entry) => entry.turnNo >= desde))
        expect(parcial.scores).toStrictEqual(entero.scores)
        expect(parcial.mustFinalize).toBe(entero.mustFinalize)
      }
    })
  }

  it('el recorrido no depende del orden de las mesas de juego', () => {
    const girada: readonly ReplayPlayer[] = [
      PLAYERS[2] as ReplayPlayer,
      PLAYERS[0] as ReplayPlayer,
      PLAYERS[3] as ReplayPlayer,
      PLAYERS[1] as ReplayPlayer,
    ]

    const porJugador = (outcome: ReplayOutcome): string =>
      [...outcome.scores]
        .sort((first, second) => first.playerId.localeCompare(second.playerId))
        .map((entry) => `${entry.playerId}=${entry.score}`)
        .join(' ')

    const uno = expectOk(replayTurns(PLAYERS, consecutiveWins(4), 1))
    const otro = expectOk(replayTurns(girada, consecutiveWins(4), 1))

    expect(otro.turns).toStrictEqual(uno.turns)
    expect(porJugador(otro)).toBe(porJugador(uno))
  })

  it('cada asiento puede ser dealer exactamente una vez en una vuelta completa', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(4), 1))
    const dealers = outcome.turns.map((entry) => entry.dealerId)

    expect(new Set(dealers).size).toBe(4)
  })
})

describe('T13 · ida y vuelta', () => {
  it('borrar un turno y recapturarlo con otro resultado deja su rastro en la partida', () => {
    const original = consecutiveWins(4)
    const corregido = [original[0] as CapturedTurn, drawTurn(2, [A, B, C]), ...original.slice(2)]

    const antes = expectOk(replayTurns(PLAYERS, original, 1))
    const despues = expectOk(replayTurns(PLAYERS, corregido, 1))

    // El empate lo gana el dealer en tenpai, así que renchan: la localía no avanza y el resto de
    // turnos se desplaza respecto de la partida original.
    expect(despues.turns.map((entry) => [entry.turnNo, entry.dealerId, entry.honba])).toStrictEqual(
      [
        [1, A, 0],
        [2, B, 0],
        [3, B, 1],
        [4, C, 0],
      ],
    )
    expect(despues.scores).not.toStrictEqual(antes.scores)
  })

  it('deshacer una corrección devuelve exactamente los turnos originales', () => {
    const turnos = consecutiveWins(5)
    const corregidos = turnos.map((entry, index) =>
      index === 1 ? drawTurn(entry.turnNo, [A, B, C]) : entry,
    )

    const antes = expectOk(replayTurns(PLAYERS, turnos, 1))
    const durante = expectOk(replayTurns(PLAYERS, corregidos, 1))
    const despues = expectOk(replayTurns(PLAYERS, turnos, 1))

    expect(durante.turns).not.toStrictEqual(antes.turns)
    expect(despues.turns).toStrictEqual(antes.turns)
  })

  it('borrar un turno recalcula la localía y el honba de los que quedan detrás', () => {
    const turnos = consecutiveWins(4)
    const sinSegundo = turnos.filter((entry) => entry.turnNo !== 2)

    const entero = expectOk(replayTurns(PLAYERS, turnos, 1))
    const borrado = expectOk(replayTurns(PLAYERS, sinSegundo, 1))

    expect(entero.turns.map((entry) => [entry.turnNo, entry.dealerId, entry.honba])).toStrictEqual([
      [1, A, 0],
      [2, B, 0],
      [3, C, 0],
      [4, D, 0],
    ])
    expect(borrado.turns.map((entry) => [entry.turnNo, entry.dealerId, entry.honba])).toStrictEqual(
      [
        [1, A, 0],
        [3, B, 0],
        [4, C, 0],
      ],
    )
  })
})

describe('T14 · mismo input, mismo output', () => {
  it('el mismo recorrido con las claves en otro orden devuelve turnos idénticos', () => {
    const turnos = consecutiveWins(4)
    const reordenados = turnos.map((entry) => ({
      riichiDeclaredBy: entry.riichiDeclaredBy,
      chomboId: entry.chomboId,
      discarderId: entry.discarderId,
      tenpai: entry.tenpai,
      hand: entry.hand,
      winners: entry.winners,
      resultType: entry.resultType,
      turnNo: entry.turnNo,
    }))

    const uno = expectOk(replayTurns(PLAYERS, turnos, 1))
    const otro = expectOk(replayTurns(PLAYERS, reordenados, 1))

    expect(otro.turns).toStrictEqual(uno.turns)
  })

  it('el recorrido con los identificadores de tipo marca es el mismo', () => {
    const turnos = consecutiveWins(3)

    const conMarca = turnos.map((entry) => ({
      ...entry,
      winners: entry.winners.map((id) => toPlayerId(id)),
      tenpai: entry.tenpai.map((id) => toPlayerId(id)),
    })) as readonly CapturedTurn[]

    expect(expectOk(replayTurns(PLAYERS, conMarca, 1)).turns).toStrictEqual(
      expectOk(replayTurns(PLAYERS, turnos, 1)).turns,
    )
  })
})

describe('T15 · conservación de puntos', () => {
  it('una partida sin chombo ni bote sin reclamar conserva 100 000', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(4), 1))

    expect(totalOf(outcome)).toBe(100000)
  })

  it('un chombo no destruye puntos: los reparte y la partida conserva los 100 000', () => {
    const outcome = expectOk(replayTurns(PLAYERS, [chomboTurn(1, C), chomboTurn(2, A)], 1))

    expect(totalOf(outcome)).toBe(100000)
  })

  it('un chombo conserva la localía y el contador, con la desviación 8', () => {
    const turnos = [tsumoTurn(1, A), tsumoTurn(2, A), chomboTurn(3, D), tsumoTurn(4, A)]
    const outcome = expectOk(replayTurns(PLAYERS, turnos, 1))

    // El Este gana el turno 1, así que el turno 2 entra con honba 1; al ganarlo también, el turno 3
    // entra con honba 2. El turno 3 es un chombo, que no mueve ni la localía ni el contador, así que el
    // turno 4 lo juega otra vez el Este con honba 2.
    expect(outcome.turns.map((entry) => [entry.turnNo, entry.dealerId, entry.honba])).toStrictEqual(
      [
        [1, A, 0],
        [2, A, 1],
        [3, A, 2],
        [4, A, 2],
      ],
    )
  })

  it('cada ficha de riichi sin reclamar resta 1 000', () => {
    const sinReclamar = expectOk(
      replayTurns(
        PLAYERS,
        [tsumoTurn(1, B), drawTurn(2, [A, B], { riichiDeclaredBy: [C] }), drawTurn(3, [A, D])],
        1,
      ),
    )

    expect(totalOf(sinReclamar)).toBe(100000 - 1000)
  })

  it('un bote reclamado sí vuelve a la partida', () => {
    const reclamado = expectOk(
      replayTurns(PLAYERS, [drawTurn(1, [A, C], { riichiDeclaredBy: [B] }), tsumoTurn(2, A)], 1),
    )

    expect(totalOf(reclamado)).toBe(100000)
  })

  it('tras corregir vuelve a la fórmula de conservación de puntos', () => {
    const turnos = [
      chomboTurn(1, C),
      tsumoTurn(2, A),
      drawTurn(3, [A, B], { riichiDeclaredBy: [C] }),
    ]
    const sinChombo = turnos.filter((entry) => entry.resultType !== 'chombo')

    const conChombo = expectOk(replayTurns(PLAYERS, turnos, 1))
    const corregido = expectOk(replayTurns(PLAYERS, sinChombo, 1))

    expect(totalOf(conChombo)).toBe(100000 - 1000)
    expect(totalOf(corregido)).toBe(100000 - 1000)
  })
})

describe('T15 · rechazo entero', () => {
  it('una corrección inválida no devuelve ningún turno escrito', () => {
    const turnos = [tsumoTurn(1, B), tsumoTurn(2, C), tsumoTurn(3, D)]
    const inválidos = [...turnos, ronTurn(4, A, B, { winners: [A, B, C, D] })]

    const resultado = replayTurns(PLAYERS, inválidos, 2)

    expect(resultado).toStrictEqual({ ok: false, turnNo: 4, reason: 'turnUnresolvable' })
  })

  it('el rechazo nombra el primer turno inválido, no el último', () => {
    const turnos = [
      tsumoTurn(1, B),
      ronTurn(2, A, B, { winners: [A, B, C, D] }),
      ronTurn(3, A, B, { winners: [A, B, C, D] }),
    ]

    const resultado = replayTurns(PLAYERS, turnos, 1)

    expect(resultado).toStrictEqual({ ok: false, turnNo: 2, reason: 'turnUnresolvable' })
  })

  it('un recorrido válido devuelve exactamente los turnos desde el punto pedido', () => {
    const turnos = consecutiveWins(5)

    expect(expectOk(replayTurns(PLAYERS, turnos, 3)).turns.map((e) => e.turnNo)).toStrictEqual([
      3, 4, 5,
    ])
    expect(expectOk(replayTurns(PLAYERS, turnos, 5)).turns.map((e) => e.turnNo)).toStrictEqual([5])
  })

  it('el marcador es un array y no un Record indexado por identificador', () => {
    const outcome = expectOk(replayTurns(PLAYERS, consecutiveWins(2), 1))

    expect(Array.isArray(outcome.scores)).toBe(true)
    expect(outcome.scores).toHaveLength(4)
  })

  it('cada turno re-derivado lleva su bote de riichi y sus deltas', () => {
    const turnos = [
      drawTurn(1, [A, C], { riichiDeclaredBy: [B] }),
      tsumoTurn(2, A),
      drawTurn(3, [A, B]),
    ]
    const salida = expectOk(replayTurns(PLAYERS, turnos, 1))

    expect(salida.turns.map((entry) => [entry.turnNo, entry.riichiSticks])).toStrictEqual([
      [1, 1],
      [2, 0],
      [3, 0],
    ])
    for (const replayed of salida.turns) {
      expect(replayed.deltas.length).toBeGreaterThan(0)
    }
  })

  it('el recorrido acepta manos con más de una ficha declarada', () => {
    const turnos = [
      drawTurn(1, [A, B], { riichiDeclaredBy: [B, C, D] }),
      drawTurn(2, [A, B]),
      drawTurn(3, [A, B]),
    ]

    expect(
      expectOk(replayTurns(PLAYERS, turnos, 1)).turns.map((e) => e.riichiSticks),
    ).toStrictEqual([3, 3, 3])
  })

  it('los yaku de viento de cada ganador se validan contra su propio asiento', () => {
    const conDosGanadores = ronTurn(1, A, D, {
      winners: [A, B],
      hand: HAND_WITH_ROUND_EAST,
    })

    expect(expectOk(replayTurns(PLAYERS, [conDosGanadores], 1)).turns).toHaveLength(1)
  })

  it('un yaku de ronda que ningún ganador posee se rechaza', () => {
    const ningunoEsEste: readonly CapturedTurn[] = [
      ...consecutiveWins(4),
      ronTurn(5, B, D, { winners: [B, C], hand: HAND_WITH_ROUND_EAST }),
    ]

    const resultado = replayTurns(PLAYERS, ningunoEsEste, 1)

    expect(resultado).toStrictEqual({ ok: false, turnNo: 5, reason: 'windYakuInvalid' })
  })

  it('los cuatro asientos pasan por la localía en una vuelta completa', () => {
    const dealers = expectOk(replayTurns(PLAYERS, consecutiveWins(5), 1)).turns.map(
      (entry) => entry.dealerId,
    )

    expect(dealers).toStrictEqual([A, B, C, D, A])
  })
})

/**
 * T03 · RF-31.6, RF-31.7 y RF-37.1. El contexto de la mano forma parte de lo que el turno guarda:
 * un turno corregido re-deriva con el contexto **nuevo**, y el `yakuHan` guardado queda igual al
 * que produce el recálculo.
 *
 * Un turno escrito antes de 004 no trae contexto: se lee igual que antes, con el `yakuHan` que ya
 * tenía guardado (RF-37.3).
 */
describe('T03 · el contexto sobrevive a la re-derivación', () => {
  const CERRADA: HandValueInput = {
    yaku: ['pinfu'],
    yakuHan: 1,
    doraCount: 0,
    fu: 30,
    isClosedHand: true,
    hasKan: false,
  }

  const ABIERTA: HandValueInput = { ...CERRADA, yakuHan: 0, isClosedHand: false }

  it('un turno corregido cambiando el contexto re-deriva con el contexto nuevo', () => {
    const antes = expectOk(replayTurns(PLAYERS, [tsumoTurn(1, B, { hand: CERRADA })], 1)).turns[0]
    const despues = expectOk(replayTurns(PLAYERS, [tsumoTurn(1, B, { hand: ABIERTA })], 1)).turns[0]

    expect(antes?.values[0]?.han).toBe(1)
    expect(despues?.values[0]?.han).toBe(0)
  })

  it('el han recalculado coincide con el guardado', () => {
    const captured = tsumoTurn(1, B, { hand: CERRADA })
    const value = expectOk(replayTurns(PLAYERS, [captured], 1)).turns[0]?.values[0]

    expect(value?.han).toBe(captured.hand.yakuHan + captured.hand.doraCount)
  })

  it('un ron múltiple re-deriva cada ganador con su propia mano', () => {
    const captured = ronTurn(1, B, D, {
      hand: CERRADA,
      winners: [B, C],
      winnerHands: [
        { playerId: B, hand: CERRADA },
        { playerId: C, hand: ABIERTA },
      ],
    })

    const values = expectOk(replayTurns(PLAYERS, [captured], 1)).turns[0]?.values ?? []

    expect(values.map((value) => value.han)).toStrictEqual([1, 0])
  })

  it('un turno sin contexto se lee igual que antes de 004', () => {
    const captured = tsumoTurn(1, B, { hand: HAND_1 })
    const value = expectOk(replayTurns(PLAYERS, [captured], 1)).turns[0]?.values[0]

    expect(value?.han).toBe(HAND_1.yakuHan + HAND_1.doraCount)
  })
})
