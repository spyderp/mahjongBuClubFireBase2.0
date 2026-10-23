import { initialHandState, nextHand } from './rules'
import type { HandOutcome, HandState } from './rules'
import { checkSquare, resolveTurn } from './turn'
import type { PlayerDelta, TurnInput, TurnResolution, TurnValue } from './turn'
import { isWindYaku, validateWindYaku } from './yaku'
import type { YakuId } from './yaku'
import type { HandValueInput } from './handValue'
import type { PlayerId, ResultType, Seat, Wind } from './types'

/**
 * Jugador en la mesa, con su asiento y su marcador. El recorrido trabaja sobre una copia y
 * avanza el marcador en ella, así que el array que recibe no se toca.
 */
export type ReplayPlayer = {
  readonly playerId: PlayerId
  readonly seat: Seat
  readonly score: number
}

/**
 * Lo que de un turno guardado necesita el recorrido para volver a resolverlo.
 *
 * Deliberadamente **no** es el documento de Firestore: a este le faltan `discarderId` y
 * `chomboId`, y sin ellos un ron o un chombo guardado no se puede reconstruir. El adaptador desde
 * `TurnRecord` es de la capa de datos y va en `data/turns.repository.ts`.
 *
 * Solo aparecen los campos que escribió quien captura. La ronda, la localía y el honba no están
 * aquí porque se derivan (RF-18.13).
 */
/**
 * La mano de **un** ganador, con su contexto (RF-31.7). Solo hay una por ganador cuando el ron
 * tiene más de uno: en el caso de un solo ganador la mano es la del turno.
 */
export type CapturedWinnerHand = {
  readonly playerId: PlayerId
  readonly hand: HandValueInput
}

export type CapturedTurn = {
  readonly turnNo: number
  readonly resultType: ResultType
  readonly hand: HandValueInput
  /**
   * RF-32.1: el desglose por ganador de un ron múltiple. Cuando está, cada ganador recalcula con
   * **su** mano —y su contexto—, y no con la del turno.
   *
   * Es opcional porque los turnos escritos antes de `specs/004` no lo tienen, y porque un turno con
   * un solo ganador no lo necesita (RF-32.2): su desglose es el del turno, como siempre.
   */
  readonly winnerHands?: readonly CapturedWinnerHand[]
  readonly winners: readonly PlayerId[]
  readonly discarderId: PlayerId | null
  readonly chomboId: PlayerId | null
  readonly tenpai: readonly PlayerId[]
  readonly riichiDeclaredBy: readonly PlayerId[]
}

/** Turno ya resuelto: todo lo que se reescribe al corregir o al borrar. */
export type ReplayedTurn = {
  readonly turnNo: number
  readonly wind: Wind
  readonly dealerId: PlayerId
  readonly honba: number
  readonly riichiSticks: number
  readonly values: readonly TurnValue[]
  readonly deltas: readonly PlayerDelta[]
}

export type ReplayScore = {
  readonly playerId: PlayerId
  readonly score: number
}

export type ReplayOutcome = {
  readonly turns: readonly ReplayedTurn[]
  readonly scores: readonly ReplayScore[]
  readonly mustFinalize: boolean
  readonly bankruptPlayerId: PlayerId | null
  /**
   * RF-23.3: el estado de la mano que se capturará a continuación —ronda, localía y honba—, que es
   * lo que la interfaz muestra en lugar de pedirlo. Es el estado **después** del último turno, así
   * que nunca coincide con el de ese turno salvo en una partida sin turnos, donde es el inicial.
   */
  readonly nextHand: HandState
}

export type ReplayRejection =
  'invalidStartTurn' | 'incompleteTurn' | 'turnUnresolvable' | 'notSquare' | 'windYakuInvalid'

export type ReplayRejectionDetail = {
  readonly ok: false
  readonly turnNo: number
  readonly reason: ReplayRejection
}

export type ReplayResult =
  { readonly ok: true; readonly outcome: ReplayOutcome } | ReplayRejectionDetail

/**
 * RF-18.7 a RF-18.19: recorre una partida desde su primer turno y devuelve, ya resueltos, los
 * turnos a partir de `desdeTurno`.
 *
 * El recorrido **siempre empieza por el turno 1**, porque el estado de la mano depende de todos los
 * anteriores; `desdeTurno` decide qué se devuelve, no qué se calcula. Por eso corregir el turno 1
 * reescribe todos los siguientes y corregir el 18 reescribe solo uno: el coste está en las
 * escrituras, no aquí.
 *
 * Es puro y determinista: mismos datos de entrada, mismos turnos devueltos, con las claves del
 * objeto en el orden que sea (RNF-1, RNF-3).
 */
export function replayTurns(
  players: readonly ReplayPlayer[],
  turns: readonly CapturedTurn[],
  desdeTurno: number,
): ReplayResult {
  if (desdeTurno < 1) {
    return { ok: false, turnNo: 0, reason: 'invalidStartTurn' }
  }

  const emitted: ReplayedTurn[] = []
  let state: HandState = initialHandState()
  let table: readonly ReplayPlayer[] = [...players]
  let riichiSticksBefore = 0
  let bankruptPlayerId: PlayerId | null = null

  for (const captured of turns) {
    const dealerId = dealerPlayerId(state.dealer, table)
    const resolved = resolveCaptured(captured, table, dealerId, state, riichiSticksBefore)

    if (!resolved.ok) {
      return resolved
    }

    const { resolution } = resolved
    table = withDeltas(table, resolution.deltas)
    bankruptPlayerId = bankruptPlayerId ?? resolution.bankruptPlayerId

    if (captured.turnNo >= desdeTurno) {
      emitted.push({
        turnNo: captured.turnNo,
        wind: state.wind,
        dealerId,
        honba: state.honba,
        riichiSticks: resolution.riichiSticks,
        values: resolution.values,
        deltas: resolution.deltas,
      })
    }

    state = nextHand(state, handOutcomeOf(captured, dealerId))
    riichiSticksBefore = resolution.riichiSticks
  }

  return {
    ok: true,
    outcome: {
      turns: emitted,
      scores: table.map((player) => ({ playerId: player.playerId, score: player.score })),
      mustFinalize: bankruptPlayerId !== null,
      bankruptPlayerId,
      nextHand: state,
    },
  }
}

type ResolvedStep =
  { readonly ok: true; readonly resolution: TurnResolution } | ReplayRejectionDetail

/**
 * RF-18.15 y RF-18.16: vuelve a comprobar la resolución del turno, el invariante de cuadre y los
 * yaku de viento. **No** vuelve a comprobar chiitoitsu, representabilidad ni presencia de yaku real
 * (RF-18.17): dependen solo de campos capturados que no han cambiado, así que su resultado no puede
 * haber variado.
 */
function resolveCaptured(
  captured: CapturedTurn,
  table: readonly ReplayPlayer[],
  dealerId: PlayerId,
  state: HandState,
  riichiSticksBefore: number,
): ResolvedStep {
  const input = turnInput(captured, table, dealerId, state, riichiSticksBefore)

  if (input.ok === false) {
    return { ok: false, turnNo: captured.turnNo, reason: 'incompleteTurn' }
  }

  const result = resolveTurn(input.value)

  if (!result.ok) {
    return { ok: false, turnNo: captured.turnNo, reason: 'turnUnresolvable' }
  }

  const resolution = result.resolution
  const claimed = isWin(captured.resultType)
    ? riichiSticksBefore + captured.riichiDeclaredBy.length
    : 0
  const square = checkSquare({
    deltas: resolution.deltas,
    riichiDeclared: captured.riichiDeclaredBy.length,
    riichiSticksClaimedThisTurn: claimed,
  })

  if (!square.ok) {
    return { ok: false, turnNo: captured.turnNo, reason: 'notSquare' }
  }

  if (!windYakuStillValid(captured, table, state.wind)) {
    return { ok: false, turnNo: captured.turnNo, reason: 'windYakuInvalid' }
  }

  return { ok: true, resolution }
}

/**
 * RF-18.10: un yaku de viento sigue siendo válido si lo posee **algún** ganador. No se valida cada
 * yaku contra cada ganador porque en un ron múltiple solo uno puede tener el asiento o la ronda que
 * ese yaku exige, y exigirlo a los demás rechazaría manos correctas.
 *
 * RF-32.1: cuando el turno trae desglose por ganador, cada yaku de viento se comprueba contra **su**
 * ganador, que es quien tiene ese asiento o esa ronda. Sin desglose —un solo ganador, o un turno
 * anterior a 004— la mano es la del turno y vale la regla de siempre.
 */
function windYakuStillValid(
  captured: CapturedTurn,
  table: readonly ReplayPlayer[],
  roundWind: Wind,
): boolean {
  const perWinner = captured.winnerHands ?? []

  if (perWinner.length > 0) {
    return perWinner.every((entry) =>
      windYakuValidFor(entry.hand.yaku, [entry.playerId], table, roundWind),
    )
  }

  return windYakuValidFor(captured.hand.yaku, captured.winners, table, roundWind)
}

function windYakuValidFor(
  yaku: readonly YakuId[],
  winnerIds: readonly PlayerId[],
  table: readonly ReplayPlayer[],
  roundWind: Wind,
): boolean {
  return yaku.filter(isWindYaku).every((wind) =>
    winnerIds.some((winnerId) => {
      const seat = table.find((player) => player.playerId === winnerId)?.seat

      return seat !== undefined && validateWindYaku([wind], { seat, roundWind }).ok
    }),
  )
}

type TurnInputResult = { readonly ok: true; readonly value: TurnInput } | { readonly ok: false }

/**
 * La mano de un ganador (RF-32.1): la suya propia si el turno trae desglose por ganador, y la del
 * turno si no lo trae —que es el caso de un solo ganador y el de todos los turnos anteriores a 004.
 */
function handOfWinner(captured: CapturedTurn, playerId: PlayerId): HandValueInput {
  const own = captured.winnerHands?.find((entry) => entry.playerId === playerId)

  return own?.hand ?? captured.hand
}

function turnInput(
  captured: CapturedTurn,
  table: readonly ReplayPlayer[],
  dealerId: PlayerId,
  state: HandState,
  riichiSticksBefore: number,
): TurnInputResult {
  const base = {
    players: table.map((player) => ({
      playerId: player.playerId,
      seat: player.seat,
      score: player.score,
    })),
    dealerId,
    honba: state.honba,
    riichiDeclaredBy: captured.riichiDeclaredBy,
    riichiSticksBefore,
    /**
     * RF-31.5: la primera mano de la partida la sabe el número de turno, no la captura. Los yaku
     * que solo cuentan en ella (`tenhou`, `chiihou`, `suuchaRiichi`) lo necesitan.
     */
    isFirstHand: captured.turnNo === 1,
  }
  const winners = captured.winners.map((playerId) => ({
    playerId,
    hand: handOfWinner(captured, playerId),
  }))

  if (captured.resultType === 'tsumo') {
    return { ok: true, value: { ...base, resultType: 'tsumo', winners } }
  }

  if (captured.resultType === 'ron') {
    if (captured.discarderId === null) {
      return { ok: false }
    }

    return {
      ok: true,
      value: { ...base, resultType: 'ron', winners, discarderId: captured.discarderId },
    }
  }

  if (captured.resultType === 'ryuukyoku') {
    return { ok: true, value: { ...base, resultType: 'ryuukyoku', tenpai: captured.tenpai } }
  }

  if (captured.chomboId === null) {
    return { ok: false }
  }

  return { ok: true, value: { ...base, resultType: 'chombo', chomboId: captured.chomboId } }
}

/**
 * RF-18.3 a RF-18.6: qué clase de mano fue, para que `nextHand` decida localía y honba. El chombo
 * no interrumpe la partida (RF-7.3), así que se comporta como un empate en el que el dealer no
 * conserva la tenpai: la localía avanza y el honba sube.
 */
function handOutcomeOf(captured: CapturedTurn, dealerId: PlayerId): HandOutcome {
  if (captured.resultType === 'chombo') {
    // RF-7.6: la mano se anula pero la localía no rota y el contador no se toca. No es un renchan
    // porque no hubo mano jugada.
    return { type: 'chombo' }
  }

  if (isWin(captured.resultType)) {
    return captured.winners.includes(dealerId) ? { type: 'dealerWin' } : { type: 'otherWin' }
  }

  if (captured.resultType === 'ryuukyoku' && captured.tenpai.includes(dealerId)) {
    return { type: 'dealerTenpaiDraw' }
  }

  return { type: 'otherDraw' }
}

function dealerPlayerId(seat: Seat, table: readonly ReplayPlayer[]): PlayerId {
  const found = table.find((player) => player.seat === seat)?.playerId

  if (found === undefined) {
    throw new Error(`ningún jugador ocupa el asiento ${seat}`)
  }

  return found
}

/**
 * Avanza el marcador. El motor omite deltas de cero, así que un jugador que no se mueve no
 * aparece en la lista: por eso el `?? 0` no es defensivo sino el caso normal de un empate general
 * o de un turno en el que solo se mueve parte de la mesa.
 */
function withDeltas(
  table: readonly ReplayPlayer[],
  deltas: readonly PlayerDelta[],
): readonly ReplayPlayer[] {
  const byPlayer = new Map(deltas.map((delta) => [delta.playerId, delta.delta]))

  return table.map((player) => ({
    ...player,
    score: player.score + (byPlayer.get(player.playerId) ?? 0),
  }))
}

function isWin(resultType: ResultType): boolean {
  return resultType === 'tsumo' || resultType === 'ron'
}
