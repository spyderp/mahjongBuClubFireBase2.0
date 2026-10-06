import type {
  GameId,
  GameLength,
  GameStatus,
  Position,
  PlayerId,
  ResultType,
  Ruleset,
  Seat,
  SeasonId,
  SeasonStatus,
  Wind,
} from '@/domain/types'

type Assert<T extends true> = T
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/** Los tres alias de marca siguen siendo cadenas: usables como clave de Firestore sin castear. */
export type T06_PlayerIdExtendsString = Assert<Equals<PlayerId extends string ? true : false, true>>
export type T06_SeasonIdExtendsString = Assert<Equals<SeasonId extends string ? true : false, true>>
export type T06_GameIdExtendsString = Assert<Equals<GameId extends string ? true : false, true>>

/** Un `string` desnudo no es asignable a un alias de marca: la marca se pierde al ampliar. */
export type T06_StringNoEsPlayerId = Assert<Equals<string extends PlayerId ? true : false, false>>
export type T06_StringNoEsSeasonId = Assert<Equals<string extends SeasonId ? true : false, false>>
export type T06_StringNoEsGameId = Assert<Equals<string extends GameId ? true : false, false>>

/** Las marcas son distintas entre sí: un PlayerId no encaja en SeasonId ni al revés. */
export type T06_PlayerIdNoEsSeasonId = Assert<
  Equals<PlayerId extends SeasonId ? true : false, false>
>
export type T06_SeasonIdNoEsGameId = Assert<Equals<SeasonId extends GameId ? true : false, false>>
export type T06_GameIdNoEsPlayerId = Assert<Equals<GameId extends PlayerId ? true : false, false>>

const crudo: string = 'cualquiera'

// @ts-expect-error un string desnudo no es asignable a PlayerId
export const comoPlayerId: PlayerId = crudo

// @ts-expect-error un string desnudo no es asignable a SeasonId
export const comoSeasonId: SeasonId = crudo

// @ts-expect-error un string desnudo no es asignable a GameId
export const comoGameId: GameId = crudo

/** RF-0.1 y RF-0.7: la partida tiene exactamente los cuatro estados acordados. */
export type T07_GameStatusExacto = Assert<
  Equals<GameStatus, 'open' | 'finalized' | 'unfinished' | 'aborted'>
>

/** RF-0.5: la temporada solo se abre y se cierra. */
export type T07_SeasonStatusExacto = Assert<Equals<SeasonStatus, 'open' | 'closed'>>

/** RF-3.12: los cuatro tipos de resultado, y el abandono de RF-7 entre ellos. */
export type T07_ResultTypeExacto = Assert<
  Equals<ResultType, 'tsumo' | 'ron' | 'ryuukyoku' | 'chombo'>
>

export type T07_GameLengthExacto = Assert<Equals<GameLength, 'tonpuusen' | 'hanchan'>>
export type T07_RulesetExacto = Assert<Equals<Ruleset, 'mahjongSouls' | 'mleague'>>
export type T07_PositionExacto = Assert<Equals<Position, '1st' | '2nd' | '3rd' | '4th'>>
export type T07_WindExacto = Assert<Equals<Wind, 'east' | 'south' | 'west' | 'north'>>
export type T07_SeatedEsWind = Assert<Equals<Seat, Wind>>

/** Un valor de unión no se puede inventar: `const f = 'east' satisfies Wind` acepta solo los cuatro. */
export const vientoValido = 'east' satisfies Wind
export const resultadoValido = 'chombo' satisfies ResultType

// @ts-expect-error 'abandoned' no es un GameStatus
export const estadoInvalido: GameStatus = 'abandoned'

// @ts-expect-error 'nagashi' no es un ResultType
export const resultadoInvalido: ResultType = 'nagashi'

// @ts-expect-error 'tonpuu' no es un GameLength
export const longitudInvalida: GameLength = 'tonpuu'
