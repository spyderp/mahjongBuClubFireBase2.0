import type { SeasonId, SeasonStatus, Timestamp } from './types'

const DAY_IN_SECONDS = 86400

/** Vista de temporada que el dominio necesita: identidad, rango inclusivo de días y estado. */
export type SeasonRange = {
  readonly id: SeasonId
  readonly title: string
  readonly dateFrom: Timestamp
  readonly dateTo: Timestamp
  readonly status: SeasonStatus
}

/**
 * RF-11.3: rechaza una temporada cuya fecha de inicio sea posterior a la de fin. El rango es
 * inclusivo por días naturales (`docs/domain.md`), así que un solo día es válido aunque las horas
 * del `Timestamp` se crucen.
 */
export function validateSeasonRange(dateFrom: Timestamp, dateTo: Timestamp): boolean {
  return dayNumber(dateFrom) <= dayNumber(dateTo)
}

/**
 * RF-11.2: detecta la primera temporada existente cuyo rango solapa con el candidato, para poder
 * indicar cuál rechaza la creación. Los extremos que se tocan cuentan como solapados (rangos
 * inclusivos). Con temporadas no solapadas entre sí, a lo sumo una puede coincidir.
 */
export function findOverlapping(
  seasons: readonly SeasonRange[],
  dateFrom: Timestamp,
  dateTo: Timestamp,
): SeasonRange | null {
  for (const existing of seasons) {
    if (rangesOverlap(existing, dateFrom, dateTo)) {
      return existing
    }
  }

  return null
}

/**
 * RF-11.5 y RF-11.6: asigna la partida a la temporada cuyo rango contiene su fecha, sin elección
 * del capturador. Fuera de todo rango devuelve `null`: la partida queda sin temporada pero no
 * inválida (RF-11.6). Las temporadas cerradas siguen ocupando su rango.
 */
export function seasonForDate(
  seasons: readonly SeasonRange[],
  date: Timestamp,
): SeasonRange | null {
  for (const candidate of seasons) {
    if (isDateInSeason(candidate, date)) {
      return candidate
    }
  }

  return null
}

/** ¿Cae la fecha dentro del rango inclusivo de la temporada? */
export function isDateInSeason(season: SeasonRange, date: Timestamp): boolean {
  const from = dayNumber(season.dateFrom)
  const to = dayNumber(season.dateTo)
  const target = dayNumber(date)

  return from <= target && target <= to
}

/**
 * RF-0.5 y RF-11.4: una temporada cerrada no admite partidas cuya fecha caiga dentro de su rango.
 * Fuera del rango (o con la temporada abierta) no hay motivo de rechazo por parte de esta temporada.
 */
export function canAcceptGameDate(season: SeasonRange, date: Timestamp): boolean {
  return season.status !== 'closed' || !isDateInSeason(season, date)
}

/** RF-0.6: el rango de fechas de una temporada cerrada es inmutable. */
export function canUpdateRange(season: SeasonRange): boolean {
  return season.status === 'open'
}

function rangesOverlap(season: SeasonRange, dateFrom: Timestamp, dateTo: Timestamp): boolean {
  return (
    dayNumber(dateFrom) <= dayNumber(season.dateTo) &&
    dayNumber(season.dateFrom) <= dayNumber(dateTo)
  )
}

function dayNumber(timestamp: Timestamp): number {
  return Math.floor(timestamp.seconds / DAY_IN_SECONDS)
}
