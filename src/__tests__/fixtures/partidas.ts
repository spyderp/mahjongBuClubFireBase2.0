import type { CapturedTurn, ReplayPlayer } from '@/domain/replay'
import type { HandValueInput } from '@/domain/handValue'
import { toPlayerId } from '@/domain/types'
import type { PlayerId } from '@/domain/types'

/**
 * T40 · Las tres partidas completas que `specs/001` §6.4 declaró y nunca creó.
 *
 * Son **`CapturedTurn[]`, no documentos**: son la entrada de `domain/replay.ts`, que es donde se
 * recorre una partida. Los valores derivados —ronda, localía, contador y pagos— no van aquí a
 * propósito: ponerlos sería copiar a mano lo que el motor tiene que calcular, y una fixture con el
 * resultado dentro no distinguiría un motor correcto de uno que devuelve lo que se le escribió.
 *
 * Los identificadores son los mismos en las tres (`a`…`d`) para que un test pueda comparar una
 * partida con otra sin translationes.
 */

export const A = toPlayerId('a')
export const B = toPlayerId('b')
export const C = toPlayerId('c')
export const D = toPlayerId('d')

/** Cuatro jugadores, marcador inicial y asientos de Este a Norte. `startPoints` de `plan.md` §4.1. */
export const MESA: readonly ReplayPlayer[] = [
  { playerId: A, seat: 'east', score: 25000 },
  { playerId: B, seat: 'south', score: 25000 },
  { playerId: C, seat: 'west', score: 25000 },
  { playerId: D, seat: 'north', score: 25000 },
]

/** 1 han 30 fu, *tanyao* sola: 1000 puntos. La mano de referencia de la mayoría de los turnos. */
export const TAN_YAO_1_HAN: HandValueInput = { yaku: ['tanyao'], yakuHan: 1, doraCount: 0, fu: 30 }

/** 2 han 30 fu: 2000 puntos. Para el ron múltiple, que necesita manos distintas entre sí. */
export const TAN_YAO_2_HAN: HandValueInput = { yaku: ['tanyao'], yakuHan: 2, doraCount: 0, fu: 30 }

function turno(
  turnNo: number,
  partial: Partial<CapturedTurn> & Pick<CapturedTurn, 'resultType'>,
): CapturedTurn {
  return {
    turnNo,
    resultType: partial.resultType,
    hand: partial.hand ?? TAN_YAO_1_HAN,
    winners: partial.winners ?? [],
    discarderId: partial.discarderId ?? null,
    chomboId: partial.chomboId ?? null,
    tenpai: partial.tenpai ?? [],
    riichiDeclaredBy: partial.riichiDeclaredBy ?? [],
  }
}

/**
 * T40 · `tonpuusenSencilla`: los cuatro turnos que el modo `tonpuusen` exige como mínimo, y nada
 * más. Recorre las cuatro formas de resultado que puede tener una mano —tsumo del dealer, empate sin
 * su tenpai, ron y empate con su tenpai— sin ni un riichi ni un chombo, así que es la fixture con la
 * que se comprueba que el caso base sigue dando 100 000.
 */
export const TONPUUSEN_SENCILLA: readonly CapturedTurn[] = [
  // 1 · El Este gana por tsumo. Renchan: conserva la localía y el contador pasa a 1.
  turno(1, { resultType: 'tsumo', winners: [A] }),
  // 2 · Empate con solo el Sur en tenpai. El Este la pierde: la localía avanza al Sur, contador 0.
  turno(2, { resultType: 'ryuukyoku', tenpai: [B] }),
  // 3 · Ron del Norte sobre el Este. La localía avanza al Oeste, contador 0.
  turno(3, { resultType: 'ron', winners: [D], discarderId: A }),
  // 4 · Empate con el Oeste en tenpai. Renchan: la localía no se mueve, contador 1.
  turno(4, { resultType: 'ryuukyoku', tenpai: [C, D] }),
]

/**
 * T40 · `partidaConChombo`: las **dos** ramas del chombo, porque el importe depende de si quien
 * abandona es la localía y eso no se ve si la fixture solo trae un caso.
 *
 * - El turno 2 es un chombo de un jugador que **no** es la localía: 8000 repartidos con 4000 al
 *   dealer y 2000 a cada no-dealer.
 * - El turno 4 es un chombo **de la localía**: 12000 repartidos a 4000 a cada rival.
 *
 * Los dos conservan el contador y la localía, que es lo que los distingue de un renchan.
 */
export const PARTIDA_CON_CHOMBO: readonly CapturedTurn[] = [
  // 1 · Empate con solo el Sur en tenpai: la localía pasa a B y el contador queda a cero.
  turno(1, { resultType: 'ryuukyoku', tenpai: [B] }),
  // 2 · Chombo de C, que no es la localía. B conserva la localía y el contador no se mueve.
  turno(2, { resultType: 'chombo', chomboId: C }),
  // 3 · Tsumo de la localía (B). Renchan: contador a 1.
  turno(3, { resultType: 'tsumo', winners: [B] }),
  // 4 · Chombo de la propia localía (B). Sigue siendo B y el contador sigue en 1.
  turno(4, { resultType: 'chombo', chomboId: B }),
  // 5 · Ron del Norte sobre el Este. La localía avanza al Oeste y el contador vuelve a cero.
  turno(5, { resultType: 'ron', winners: [D], discarderId: A }),
]

/**
 * T40 · `hanchanConTodo`: diez turnos —el mínimo de `hanchan` son ocho— con **las cuatro
 * declaraciones de riichi**, un **ron múltiple** y un **chombo**, que es la combinación que exige el
 * criterio 24 para poder recorrer una partida con reparto de riichi de extremo a extremo.
 *
 * Las cuatro fichas **no** seequalities todas: la de C y la de D se adjudican en el turno 3 y la de
 * A en el 5, pero **la de B nunca se reclama** porque se declara en la última mano, que es un empate.
 * Por eso el marcador final **no** suma 100 000, y eso es justo lo que la fixture tiene que hacer
 * comprobable (`docs/domain.md` §5).
 *
 * El reparto de tenpai y de autores está escrito para que la progresión sea legible a ojo: cada
 * comentario dice qué hace la mano con la localía y con el contador.
 */
export const HANCHAN_CON_TODO: readonly CapturedTurn[] = [
  // 1 · Empate con solo el Sur en tenpai: la localía pasa a B, contador 0.
  turno(1, { resultType: 'ryuukyoku', tenpai: [B] }),
  // 2 · C declara riichi y hay empate con B y C en tenpai. El dealer (B) conserva la localía → 1.
  turno(2, { resultType: 'ryuukyoku', tenpai: [B, C], riichiDeclaredBy: [C] }),
  // 3 · D declara riichi y C gana por ron sobre A. Las dos fichas se adjudication aquí y el bote va
  //     a C, que es el único ganador. La localía avanza a C y el contador vuelve a 0.
  turno(3, {
    resultType: 'ron',
    winners: [C],
    discarderId: A,
    hand: { yaku: ['riichi', 'tanyao'], yakuHan: 2, doraCount: 0, fu: 30 },
    riichiDeclaredBy: [D],
  }),
  // 4 · A declara riichi y D comete chombo. Ni la localía ni el contador se mueven; la ficha de A
  //     sigue en la mesa.
  turno(4, { resultType: 'chombo', chomboId: D, riichiDeclaredBy: [A] }),
  // 5 · Ron múltiple: ganan A (2 han) y B (1 han) sobre el descarte de D. El bote —la ficha de A— va
  //     a la mano mayor. La localía avanza a D y el contador vuelve a 0.
  turno(5, {
    resultType: 'ron',
    winners: [A, B],
    discarderId: D,
    hand: TAN_YAO_2_HAN,
  }),
  // 6 · Todos tienen tenpai: nadie paga. La localía (D) la conserva → contador 1.
  turno(6, { resultType: 'ryuukyoku', tenpai: [A, B, C, D] }),
  // 7 · Tsumo de la localía (D) con contador 1: 500 de cada uno más 100 de honba. Renchan → contador 2.
  turno(7, { resultType: 'tsumo', winners: [D] }),
  // 8 · Empate con solo el Este en tenpai. D pierde la localía: avanza a A y el contador a 0. Como la
  //     localía vuelve al asiento Este, el viento de ronda avanza de Este a Sur.
  turno(8, { resultType: 'ryuukyoku', tenpai: [A] }),
  // 9 · Ron de B sobre C. Se adjudica la ficha de B. La localía avanza a B, contador 0.
  turno(9, { resultType: 'ron', winners: [B], discarderId: C }),
  // 10 · Empate con la localía (B) en tenpai. Renchan: contador 1. B declara su riichi en la última
  //     mano, así que la ficha se queda en la mesa y la partida no vuelve a 100 000.
  turno(10, { resultType: 'ryuukyoku', tenpai: [B], riichiDeclaredBy: [B] }),
]

/** Las tres, por nombre, para que un test puedaitersar sobre ellas sin repetir el array. */
export const PARTIDAS_COMPLETAS = {
  tonpuusenSencilla: TONPUUSEN_SENCILLA,
  hanchanConTodo: HANCHAN_CON_TODO,
  partidaConChombo: PARTIDA_CON_CHOMBO,
} as const

/** Identificadores de las cuatro fixtures, para leer los mensajes de fallo sin repetir literales. */
export type FixtureId = keyof typeof PARTIDAS_COMPLETAS

/** `CapturedTurn` con `turnNo` renumerado, para simular el borrado de un turno intermedio. */
export function renumerar(turns: readonly CapturedTurn[], sinTurno: number): CapturedTurn[] {
  return turns
    .filter((entry) => entry.turnNo !== sinTurno)
    .map((entry, index) => ({ ...entry, turnNo: index + 1 }))
}

/**
 * Traduce los identificadores simbólicos de la fixture a los de una mesa real, **en el mismo
 * orden de asientos**. Hace falta porque `playersRepository` genera el identificador del documento:
 * sin esto, `tenpai` y `riichiDeclaredBy` señalarían a jugadores que no están en la mesa, el motor no
 * cobraría nada y el invariante de cuadre rechazaría el turno —con un `notSquare` que no tiene nada
 * que ver con la partida.
 */
export function conIdsDe(
  turns: readonly CapturedTurn[],
  mesa: readonly ReplayPlayer[],
): readonly CapturedTurn[] {
  const mapeo = new Map<PlayerId, PlayerId>(
    MESA.map((player, index) => [player.playerId, mesa[index]?.playerId ?? player.playerId]),
  )
  const traducir = (playerId: PlayerId | null): PlayerId | null =>
    playerId === null ? null : (mapeo.get(playerId) ?? playerId)

  return turns.map((turn) => ({
    ...turn,
    winners: turn.winners.map((winnerId) => traducir(winnerId) ?? winnerId),
    discarderId: traducir(turn.discarderId),
    chomboId: traducir(turn.chomboId),
    tenpai: turn.tenpai.map((playerId) => traducir(playerId) ?? playerId),
    riichiDeclaredBy: turn.riichiDeclaredBy.map((playerId) => traducir(playerId) ?? playerId),
  }))
}
