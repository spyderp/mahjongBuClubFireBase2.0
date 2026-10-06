import { describe, expect, it } from 'vitest'
import {
  canAcceptGameDate,
  canUpdateRange,
  findOverlapping,
  isDateInSeason,
  seasonForDate,
  validateSeasonRange,
} from '@/domain/seasons'
import type { SeasonRange } from '@/domain/seasons'
import { toSeasonId } from '@/domain/types'
import type { SeasonId, SeasonStatus, Timestamp } from '@/domain/types'

const DAY_IN_SECONDS = 86400

const S1 = toSeasonId('s1')
const S2 = toSeasonId('s2')

function atDay(day: number): Timestamp {
  return { seconds: day * DAY_IN_SECONDS, nanoseconds: 0 }
}

function season(
  id: SeasonId,
  from: number,
  to: number,
  status: SeasonStatus = 'open',
): SeasonRange {
  return { id, title: `Temporada ${id}`, dateFrom: atDay(from), dateTo: atDay(to), status }
}

describe('T47 · validación del rango de fechas', () => {
  it('un rango con la fecha de inicio después de la de fin se rechaza', () => {
    expect(validateSeasonRange(atDay(10), atDay(5))).toBe(false)
  })

  it('un rango normal y uno de un solo día son válidos', () => {
    expect(validateSeasonRange(atDay(5), atDay(10))).toBe(true)
    expect(validateSeasonRange(atDay(7), atDay(7))).toBe(true)
  })

  it('la validez se evalúa por día natural: dentro del mismo día vale aunque las horas se crucen', () => {
    const lateInDay = { seconds: 7 * DAY_IN_SECONDS + 86399, nanoseconds: 0 }
    const earlyInDay = { seconds: 7 * DAY_IN_SECONDS + 1, nanoseconds: 0 }

    expect(validateSeasonRange(lateInDay, earlyInDay)).toBe(true)
  })
})

describe('T48 · detección de solapamiento', () => {
  it('dos rangos que se tocan en un extremo se consideran solapados', () => {
    const existing = [season(S1, 1, 10)]

    expect(findOverlapping(existing, atDay(10), atDay(15))?.id).toBe(S1)
    expect(findOverlapping(existing, atDay(0), atDay(1))?.id).toBe(S1)
  })

  it('un rango contenido en otro, o que lo contiene, también solapa', () => {
    const existing = [season(S1, 1, 10)]

    expect(findOverlapping(existing, atDay(6), atDay(7))?.id).toBe(S1)
    expect(findOverlapping(existing, atDay(-2), atDay(12))?.id).toBe(S1)
  })

  it('rangos separados no solapan', () => {
    const existing = [season(S1, 5, 10)]

    expect(findOverlapping(existing, atDay(1), atDay(4))).toBeNull()
    expect(findOverlapping(existing, atDay(11), atDay(15))).toBeNull()
  })

  it('indica cuál solapa: devuelve la primera temporada que se encuentra', () => {
    const existing = [season(S1, 1, 10), season(S2, 15, 20)]

    expect(findOverlapping(existing, atDay(16), atDay(25))?.id).toBe(S2)
  })
})

describe('T49 · asignación de partida a temporada por fecha', () => {
  const seasons = [season(S1, 1, 7), season(S2, 10, 14)]

  it('una fecha dentro del rango devuelve esa temporada', () => {
    expect(seasonForDate(seasons, atDay(3))?.id).toBe(S1)
    expect(seasonForDate(seasons, atDay(12))?.id).toBe(S2)
  })

  it('el primer y el último día del rango son inclusivos', () => {
    expect(seasonForDate(seasons, atDay(1))?.id).toBe(S1)
    expect(seasonForDate(seasons, atDay(7))?.id).toBe(S1)
    expect(seasonForDate(seasons, atDay(10))?.id).toBe(S2)
    expect(seasonForDate(seasons, atDay(14))?.id).toBe(S2)
  })

  it('con los rangos sin solapar, ninguna fecha devuelve dos temporadas', () => {
    const dates = [1, 3, 7, 10, 12, 14]
    const failures: string[] = []

    for (const day of dates) {
      const matches = seasons.filter((candidate) => isDateInSeason(candidate, atDay(day)))

      if (matches.length !== 1) {
        failures.push(`día ${day}: ${matches.length} coincidencias`)
      }
    }

    expect(failures).toStrictEqual([])
  })
})

describe('T50 · partida sin temporada', () => {
  const seasons = [season(S1, 1, 7), season(S2, 10, 14)]

  it('una fecha fuera de todo rango devuelve null', () => {
    expect(seasonForDate(seasons, atDay(0))).toBeNull()
    expect(seasonForDate(seasons, atDay(8))).toBeNull()
    expect(seasonForDate(seasons, atDay(9))).toBeNull()
    expect(seasonForDate(seasons, atDay(15))).toBeNull()
  })

  it('sin temporada asignada, o sin temporadas, la partida no se considera inválida', () => {
    expect(seasonForDate(seasons, atDay(8))).toBeNull()
    expect(seasonForDate([], atDay(8))).toBeNull()
  })
})

describe('T51 · estado de temporada', () => {
  it('una temporada abierta acepta partidas dentro de su rango', () => {
    const open = season(S1, 1, 10, 'open')

    expect(canAcceptGameDate(open, atDay(5))).toBe(true)
    expect(canAcceptGameDate(open, atDay(1))).toBe(true)
    expect(canAcceptGameDate(open, atDay(10))).toBe(true)
  })

  it('una temporada cerrada rechaza fechas dentro de su rango', () => {
    const closed = season(S1, 1, 10, 'closed')

    expect(canAcceptGameDate(closed, atDay(5))).toBe(false)
    expect(canAcceptGameDate(closed, atDay(1))).toBe(false)
    expect(canAcceptGameDate(closed, atDay(10))).toBe(false)
  })

  it('una fecha fuera del rango no es rechazada por la temporada cerrada', () => {
    const closed = season(S1, 1, 10, 'closed')

    expect(canAcceptGameDate(closed, atDay(0))).toBe(true)
    expect(canAcceptGameDate(closed, atDay(11))).toBe(true)
  })

  it('una temporada cerrada no admite cambios de rango', () => {
    expect(canUpdateRange(season(S1, 1, 10, 'open'))).toBe(true)
    expect(canUpdateRange(season(S1, 1, 10, 'closed'))).toBe(false)
  })
})
