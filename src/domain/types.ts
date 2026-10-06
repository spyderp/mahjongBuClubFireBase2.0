declare const brandSymbol: unique symbol

export type PlayerId = string & { readonly [brandSymbol]: 'PlayerId' }
export type SeasonId = string & { readonly [brandSymbol]: 'SeasonId' }
export type GameId = string & { readonly [brandSymbol]: 'GameId' }

export type GameStatus = 'open' | 'finalized' | 'unfinished' | 'aborted'
export type SeasonStatus = 'open' | 'closed'
export type ResultType = 'tsumo' | 'ron' | 'ryuukyoku' | 'chombo'
export type GameLength = 'tonpuusen' | 'hanchan'
export type Ruleset = 'mahjongSouls' | 'mleague'
export type Position = '1st' | '2nd' | '3rd' | '4th'
export type Wind = 'east' | 'south' | 'west' | 'north'
export type Seat = Wind

export type Timestamp = {
  readonly seconds: number
  readonly nanoseconds: number
}

export type Player = {
  readonly externalId: string
  readonly name: string
  readonly active: boolean
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export type Season = {
  readonly title: string
  readonly dateFrom: Timestamp
  readonly dateTo: Timestamp
  readonly status: SeasonStatus
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export type Game = {
  readonly seasonId: SeasonId | null
  readonly date: Timestamp
  readonly gameLength: GameLength
  readonly ruleset: Ruleset
  readonly rulesetVersion: string
  readonly startPoints: number
  readonly status: GameStatus
  readonly mustFinalize: boolean
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export const PLAYER_NAME_MAX_LENGTH = 100

export type PlayerNameRejection = 'empty' | 'tooLong'

export type PlayerNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: PlayerNameRejection }

export const EXTERNAL_ID_MIN_LENGTH = 2
export const EXTERNAL_ID_MAX_LENGTH = 32
export const EXTERNAL_CODE_MAX_LENGTH = 12

const CODE_PATTERN = /^[a-z0-9]+$/
const ALIAS_CHARS = /^[a-z0-9_-]+$/
const EDGE_SEPARATORS = ['-', '_']

export type ExternalIdRejection = 'empty' | 'tooShort' | 'tooLong' | 'invalidCharacters'

export type ExternalIdResult =
  | { readonly ok: true; readonly externalId: string }
  | { readonly ok: false; readonly reason: ExternalIdRejection }

export function validatePlayerName(raw: string): PlayerNameResult {
  const name = raw.trim()

  if (name.length === 0) {
    return { ok: false, reason: 'empty' }
  }

  if (name.length > PLAYER_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'tooLong' }
  }

  return { ok: true, name }
}

export function validateExternalId(raw: string): ExternalIdResult {
  const externalId = raw.trim().toLowerCase()

  if (externalId.length === 0) {
    return { ok: false, reason: 'empty' }
  }

  if (externalId.length < EXTERNAL_ID_MIN_LENGTH) {
    return { ok: false, reason: 'tooShort' }
  }

  if (externalId.length > EXTERNAL_ID_MAX_LENGTH) {
    return { ok: false, reason: 'tooLong' }
  }

  if (!isSupportedFormat(externalId)) {
    return { ok: false, reason: 'invalidCharacters' }
  }

  return { ok: true, externalId }
}

function isSupportedFormat(value: string): boolean {
  return isCode(value) || isAlias(value)
}

function isCode(value: string): boolean {
  return value.length <= EXTERNAL_CODE_MAX_LENGTH && CODE_PATTERN.test(value)
}

function isAlias(value: string): boolean {
  return ALIAS_CHARS.test(value) && !hasEdgeSeparator(value)
}

function hasEdgeSeparator(value: string): boolean {
  const first = value.charAt(0)
  const last = value.charAt(value.length - 1)

  return EDGE_SEPARATORS.includes(first) || EDGE_SEPARATORS.includes(last)
}

const brand = <T extends string>(value: string, kind: string): T => {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new TypeError(`${kind} no puede ser vacío`)
  }

  return trimmed as T
}

export const toPlayerId = (value: string): PlayerId => brand<PlayerId>(value, 'PlayerId')
export const toSeasonId = (value: string): SeasonId => brand<SeasonId>(value, 'SeasonId')
export const toGameId = (value: string): GameId => brand<GameId>(value, 'GameId')
