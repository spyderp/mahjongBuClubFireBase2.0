import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { PARTIDA_CON_CHOMBO, conIdsDe } from '@/__tests__/fixtures/partidas'
import { gamesRepository } from '@/data/games.repository'
import { DataError } from '@/data/errors'
import {
  capturedFieldsBefore,
  capturedTurnOf,
  FIRESTORE_DOCUMENT_LIMIT_BYTES,
  toTurnSnapshot,
  TURN_PATCH_FIELDS,
  turnsRepository,
} from '@/data/turns.repository'
import type {
  CreateTurnInput,
  TurnAuditEntry,
  TurnCorrectEntry,
  TurnRecord,
  UpdateTurnPatch,
  UpdateTurnPatchField,
} from '@/data/turns.repository'
import type { CapturedTurn, ReplayedTurn } from '@/domain/replay'
import { replayTurns } from '@/domain/replay'
import { toGameId, toPlayerId } from '@/domain/types'
import type { GameId, Seat } from '@/domain/types'
import type { PlayerId } from '@/domain/types'
import { fakeAdvanceSeconds, fakeGetDb, fakeNow, fakeReset } from '@/test-utils/fakeFirestore'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

const DAY = 86400

function atDay(day: number): { seconds: number; nanoseconds: number } {
  return { seconds: day * DAY, nanoseconds: 0 }
}

const P1 = toPlayerId('p1')

const SEATS: readonly Seat[] = ['east', 'south', 'west', 'north']
const PLAYERS = SEATS.map((seat, index) => ({
  playerId: toPlayerId(`p${index + 1}`),
  seat,
}))

function turnInput(turnNo: number): CreateTurnInput {
  return {
    turnNo,
    wind: 'east',
    dealerId: P1,
    honba: 0,
    resultType: 'ryuukyoku',
    yaku: [],
    yakuHan: 0,
    doraCount: 0,
    fu: 0,
    tenpai: [],
    riichiDeclaredBy: [],
    riichiSticks: 0,
    value: [],
    deltas: [],
    capturedBy: 'user-1',
    isRenchan: false,
    isFinalTurn: false,
    discarderId: null,
    chomboId: null,
    yakuHanOverride: 0,
  }
}

async function seedGame() {
  return gamesRepository.create({
    seasonId: null,
    date: atDay(1),
    gameLength: 'tonpuusen',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: 25000,
    players: PLAYERS,
  })
}

/** Contexto mínimo de una corrección: quién la hace y cuántas entradas de registro leyó. */
function correctionOf(
  expectedAuditCount: number,
  extra: { readonly derived?: readonly UpdateTurnPatchField[]; readonly by?: string } = {},
) {
  return {
    by: extra.by ?? 'user-2',
    expectedAuditCount,
    ...(extra.derived === undefined ? {} : { derived: extra.derived }),
  }
}

function turnPath(gameId: string, turnNo: number): string {
  return `games/${gameId}/turns/${turnNo}`
}

/** Lee un documento de turno por su identificador, tal y como queda en la base. */
async function docData(
  gameId: string,
  turnId: string,
): Promise<Record<string, unknown> | undefined> {
  const snapshot = await getDoc(doc(getDb(), 'games', gameId, 'turns', turnId))

  return snapshot.data()
}

/** Lee un campo del documento sin pasar por `list`. */
async function storedField(gameId: string, turnNo: number, field: string): Promise<unknown> {
  return (await docData(gameId, String(turnNo)))?.[field]
}

/**
 * Una entrada de registro enorme: es el escenario de RF-19.14, un turno corregido muchas veces,
 * que es lo único que hace crecer el documento sin freno. `payloadChars` decide cuánto pesa.
 */
function fatAuditEntry(payloadChars: number): TurnAuditEntry {
  return {
    at: fakeNow(),
    by: 'user-2',
    action: 'correct',
    changes: [{ field: 'honba', from: 'x'.repeat(payloadChars), to: 0, derived: false }],
  }
}

function setFatAudit(gameId: string, turnNo: number, payloadChars: number): void {
  const path = turnPath(gameId, turnNo)
  const stored = fakeGetDb().docs.get(path)

  if (stored === undefined) {
    throw new Error(`no hay turno ${turnNo} que engordar`)
  }

  fakeGetDb().docs.set(path, { ...stored, audit: [fatAuditEntry(payloadChars)] })
}

/**
 * La entrada de registro de una corrección. `audit[]` es una unión porque RF-19.6 mete en el
 * mismo array el borrado de un turno posterior, así que leer `changes` exige estrechar antes.
 */
function correction(entry: TurnAuditEntry | undefined): TurnCorrectEntry | undefined {
  return entry?.action === 'correct' ? entry : undefined
}

/** Los nombres de campo de una corrección, en el orden en que los registra `update`. */
function changedFields(entry: TurnAuditEntry | undefined): readonly string[] {
  return (correction(entry)?.changes ?? []).map((change) => change.field)
}

/** Lee un turno por posición, o falla: un test que no encuentra lo que sembró no dice nada útil. */
function turnAt(turns: readonly TurnRecord[], index: number): TurnRecord {
  const found = turns[index]

  if (found === undefined) {
    throw new Error(`no hay ningún turno en la posición ${index}`)
  }

  return found
}

/** La mesa al punto de partida de una partida: 25 000 en cada asiento. */
function tableAtStart(): readonly { playerId: PlayerId; seat: Seat; score: number }[] {
  return PLAYERS.map(({ playerId, seat }) => ({ playerId, seat, score: 25000 }))
}

describe('T63 · turns.repository', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('nextNumber de una partida sin turnos es 1', async () => {
    const game = await seedGame()

    expect(await turnsRepository.nextNumber(game.id)).toBe(1)
  })

  it('create guarda el turno 1 en el documento "1" y devuelve el registro', async () => {
    const game = await seedGame()
    const created = await turnsRepository.create(game.id, turnInput(1))

    expect(created.turnNo).toBe(1)
    expect((await turnsRepository.list(game.id))[0]?.turnNo).toBe(1)

    const snapshot = await getDoc(doc(getDb(), 'games', game.id, 'turns', '1'))
    const data = snapshot.data()
    const record: Record<string, unknown> | undefined = data

    expect(record?.['turnNo']).toBe(1)
  })

  it('nextNumber avanza sin huecos y list ordena por turno', async () => {
    const game = await seedGame()

    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))

    expect(await turnsRepository.nextNumber(game.id)).toBe(3)
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toEqual([1, 2])
  })

  it('create rechaza el turno duplicado', async () => {
    const game = await seedGame()

    await turnsRepository.create(game.id, turnInput(1))

    const error = await turnsRepository
      .create(game.id, turnInput(1))
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).code).toBe('duplicateNumber')
  })

  it('create rechaza un turno que deja huecos en la secuencia', async () => {
    const game = await seedGame()

    await turnsRepository.create(game.id, turnInput(1))

    const error = await turnsRepository
      .create(game.id, turnInput(3))
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('gapInSequence')
  })

  it('create exige que el primer turno sea el 1', async () => {
    const game = await seedGame()

    const error = await turnsRepository
      .create(game.id, turnInput(5))
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('gapInSequence')
  })

  it('create sobre una partida inexistente lanza DataError notFound', async () => {
    const error = await turnsRepository
      .create(toGameId('no-existe'), turnInput(1))
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('notFound')
  })

  it('create sobre una partida finalizada lanza DataError finalizedGame', async () => {
    const game = await seedGame()
    await gamesRepository.update(game.id, {
      status: 'finalized',
      results: [],
      finalizationAudit: [{ at: fakeNow(), by: 'user-1', action: 'finalize' }],
    })

    const error = await turnsRepository
      .create(game.id, turnInput(1))
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('finalizedGame')
  })

  it('create sobre una partida terminal lanza DataError notOpen', async () => {
    const game = await seedGame()
    await gamesRepository.update(game.id, { status: 'unfinished' })

    const error = await turnsRepository
      .create(game.id, turnInput(1))
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('notOpen')
  })

  it('create refresca updatedAt de la partida para la regla de los 7 días', async () => {
    const game = await seedGame()

    fakeAdvanceSeconds(120)
    await turnsRepository.create(game.id, turnInput(1))

    const stored = await gamesRepository.getById(game.id)

    expect(stored?.updatedAt.seconds).toBeGreaterThan(game.updatedAt.seconds)
  })

  it('update aplica el parche y lanza DataError si el turno o la partida no permiten', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const updated = await turnsRepository.update(game.id, 1, { honba: 2 }, correctionOf(0))

    expect(updated.honba).toBe(2)

    const missing = await turnsRepository
      .update(game.id, 99, { honba: 1 }, correctionOf(0))
      .catch((caught: unknown) => caught)
    expect((missing as DataError).code).toBe('notFound')

    const finalized = await seedGame()
    await gamesRepository.update(finalized.id, {
      status: 'finalized',
      results: [],
      finalizationAudit: [{ at: fakeNow(), by: 'user-1', action: 'finalize' }],
    })
    const terminal = await turnsRepository
      .update(finalized.id, 1, { honba: 1 }, correctionOf(0))
      .catch((caught: unknown) => caught)
    expect((terminal as DataError).code).toBe('finalizedGame')
  })
})

/**
 * RF-20.1 a RF-20.3: el identificador es el número en decimal y sin relleno. El relleno a dos
 * dígitos era lo que hacía que el orden lexicográfico dejara de ser el cronológico a partir del
 * turno 100, así que el orden lo fija el campo numérico `turnNo` y no el identificador.
 */
describe('T23 · identificador del turno sin relleno', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('el turno 1 se llama "1" y el turno 10 se llama "10"', async () => {
    const game = await seedGame()

    for (let turnNo = 1; turnNo <= 10; turnNo += 1) {
      await turnsRepository.create(game.id, turnInput(turnNo))
    }

    expect(await docData(game.id, '1')).toBeDefined()
    expect(await docData(game.id, '10')).toBeDefined()
    expect(await docData(game.id, '01')).toBeUndefined()
    expect(await docData(game.id, '010')).toBeUndefined()
  })

  it('update y remove también usan el identificador sin relleno', async () => {
    const game = await seedGame()

    for (let turnNo = 1; turnNo <= 10; turnNo += 1) {
      await turnsRepository.create(game.id, turnInput(turnNo))
    }

    await turnsRepository.update(game.id, 10, { honba: 1 }, correctionOf(0))
    expect(await storedField(game.id, 10, 'honba')).toBe(1)

    await turnsRepository.remove(game.id, 10)
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })

  it('nextNumber también lee el turno 10 sin relleno', async () => {
    const game = await seedGame()

    for (let turnNo = 1; turnNo <= 9; turnNo += 1) {
      await turnsRepository.create(game.id, turnInput(turnNo))
    }

    expect(await turnsRepository.nextNumber(game.id)).toBe(10)

    await turnsRepository.create(game.id, turnInput(10))
    expect(await turnsRepository.nextNumber(game.id)).toBe(11)
  })

  /**
   * El caso queotivó el cambio: 150 turnos. Ordenados por identificador darían
   * 1, 10, 100, 101…, así que este test falla en cuanto `list` deje de ordenar por `turnNo`.
   */
  it('registra 150 turnos y los devuelve en orden correlativo', async () => {
    const game = await seedGame()

    for (let turnNo = 1; turnNo <= 150; turnNo += 1) {
      await turnsRepository.create(game.id, turnInput(turnNo))
    }

    const stored = await turnsRepository.list(game.id)

    expect(stored).toHaveLength(150)
    expect(stored.map((turn) => turn.turnNo)).toStrictEqual(
      Array.from({ length: 150 }, (_unused, index) => index + 1),
    )
    expect(await turnsRepository.nextNumber(game.id)).toBe(151)
  }, 60_000)
})

/**
 * RF-19.1 a RF-19.3 y RF-19.5: corregir reescribe el turno y deja constancia. `capturedBy` no se
 * toca nunca —identifica la versión original— y cada corrección añade su entrada sin reescribir
 * las anteriores (RF-19.9).
 */
describe('T24 · escritura del audit[] del turno', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('un turno recién creado no tiene registro ni autor de corrección', async () => {
    const game = await seedGame()
    const created = await turnsRepository.create(game.id, turnInput(1))

    expect(created.audit).toStrictEqual([])
    expect(created.updatedBy).toBeNull()
    expect(created.updatedAt).toBeNull()
    expect(await storedField(game.id, 1, 'audit')).toStrictEqual([])

    // El documento omite los dos campos en vez de guardarlos como null: la ausencia es el dato.
    expect(await storedField(game.id, 1, 'updatedBy')).toBeUndefined()
    expect(await storedField(game.id, 1, 'updatedAt')).toBeUndefined()
  })

  it('corregir deja capturedBy intacto y añade updatedBy, updatedAt y la entrada', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    fakeAdvanceSeconds(60)

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { honba: 2, resultType: 'tsumo' },
      correctionOf(0),
    )

    expect(corrected.capturedBy).toBe('user-1')
    expect(corrected.updatedBy).toBe('user-2')
    expect(corrected.updatedAt).toEqual(fakeNow())
    expect(corrected.audit).toStrictEqual([
      {
        at: fakeNow(),
        by: 'user-2',
        action: 'correct',
        changes: [
          { field: 'honba', from: 0, to: 2, derived: false },
          { field: 'resultType', from: 'ryuukyoku', to: 'tsumo', derived: false },
        ],
      },
    ])
  })

  it('la entrada registra el valor anterior de cada campo modificado y solo de esos', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { yaku: ['tanyao', 'haku'], fu: 30 },
      correctionOf(0),
    )

    expect(correction(corrected.audit[0])?.changes).toStrictEqual([
      { field: 'yaku', from: [], to: ['tanyao', 'haku'], derived: false },
      { field: 'fu', from: 0, to: 30, derived: false },
    ])
  })

  it('marca como derivados los campos que el sistema ha recalculado (RF-19.5)', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { yakuHan: 3, deltas: [{ playerId: P1, delta: 100 }] },
      correctionOf(0, { derived: ['yakuHan', 'deltas'] }),
    )

    expect(correction(corrected.audit[0])?.changes).toStrictEqual([
      { field: 'yakuHan', from: 0, to: 3, derived: true },
      { field: 'deltas', from: [], to: [{ playerId: P1, delta: 100 }], derived: true },
    ])
  })

  it('un campo reescrito con el mismo valor no se registra, ni siquiera marcado como derivado', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { yaku: [], isRenchan: false },
      correctionOf(0, { derived: ['yaku', 'isRenchan'] }),
    )

    expect(corrected.audit).toStrictEqual([])
  })

  it('una segunda corrección añade su entrada sin tocar la primera', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const firstAt = fakeNow()
    await turnsRepository.update(game.id, 1, { honba: 1 }, correctionOf(0))
    fakeAdvanceSeconds(120)
    const second = await turnsRepository.update(
      game.id,
      1,
      { honba: 3 },
      correctionOf(1, { by: 'user-3' }),
    )

    expect(second.audit).toHaveLength(2)
    expect(second.audit[0]).toStrictEqual({
      at: firstAt,
      by: 'user-2',
      action: 'correct',
      changes: [{ field: 'honba', from: 0, to: 1, derived: false }],
    })
    expect(second.audit[1]).toStrictEqual({
      at: fakeNow(),
      by: 'user-3',
      action: 'correct',
      changes: [{ field: 'honba', from: 1, to: 3, derived: false }],
    })
    expect(second.updatedBy).toBe('user-3')
    expect(second.capturedBy).toBe('user-1')
  })

  it('una corrección que no cambia nada no deja entrada ni toca updatedBy', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { honba: 0, resultType: 'ryuukyoku' },
      correctionOf(0),
    )

    expect(corrected.audit).toStrictEqual([])
    expect(corrected.updatedBy).toBeNull()
    expect(await storedField(game.id, 1, 'updatedBy')).toBeUndefined()
  })

  it('el campo capturedBy no se puede corregir: no está en el parche', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { honba: 1, ...({ capturedBy: 'otro' } as object) },
      correctionOf(0),
    )

    expect(corrected.capturedBy).toBe('user-1')
    expect(changedFields(corrected.audit[0])).toStrictEqual(['honba'])
  })

  it('el orden de las claves del parche no cambia el orden del registro', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const first = await turnsRepository.update(
      game.id,
      1,
      { honba: 2, resultType: 'tsumo', fu: 30 },
      correctionOf(0),
    )
    const second = await turnsRepository.update(
      game.id,
      1,
      { fu: 40, resultType: 'ron', honba: 5 },
      correctionOf(1),
    )

    expect(changedFields(second.audit[1])).toStrictEqual(changedFields(first.audit[0]))
  })

  it('cada campo del parche es auditable: la lista y el tipo no se separan', async () => {
    expect(TURN_PATCH_FIELDS).not.toContain('capturedBy')
    expect(TURN_PATCH_FIELDS).not.toContain('turnNo')
    expect(TURN_PATCH_FIELDS).not.toContain('audit')

    for (const field of TURN_PATCH_FIELDS) {
      const game = await seedGame()
      await turnsRepository.create(game.id, turnInput(1))
      const patch = { [field]: 'x' } as unknown as Parameters<typeof turnsRepository.update>[2]
      const corrected = await turnsRepository.update(game.id, 1, patch, correctionOf(0))

      expect(changedFields(corrected.audit[0])).toStrictEqual([field])
    }
  })
})

/**
 * RF-19.12: dos personas corrigen el mismo turno desde dos sitios. La segunda leyó un registro con
 * cero entradas y al escribir findselo con una; si la dejara pasar, sobrescribiría la corrección
 * ajena y el rastro de RNF-2 perdería una entrada sin que nadie lo notase.
 */
describe('T25 · lectura-verificación antes de escribir', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('rechaza con conflict y no escribe nada si el registro cambió entre lectura y escritura', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    // Dos dispositivos leen el turno a la vez: los dos ven cero correcciones.
    const firstRead = await turnsRepository.list(game.id)
    expect(firstRead[0]?.audit).toHaveLength(0)

    const winner = await turnsRepository.update(game.id, 1, { honba: 1 }, correctionOf(0))
    expect(winner.audit).toHaveLength(1)

    const loser = await turnsRepository
      .update(game.id, 1, { fu: 30 }, correctionOf(0, { by: 'user-3' }))
      .catch((caught: unknown) => caught)

    expect(loser).toBeInstanceOf(DataError)
    expect((loser as DataError).code).toBe('conflict')

    const stored = await turnsRepository.list(game.id)

    expect(stored[0]?.honba).toBe(1)
    expect(stored[0]?.fu).toBe(0)
    expect(stored[0]?.updatedBy).toBe('user-2')
    expect(stored[0]?.audit).toHaveLength(1)
  })

  it('acepta la corrección que coincide con lo leído', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    await turnsRepository.update(game.id, 1, { honba: 1 }, correctionOf(0))
    const again = await turnsRepository.update(game.id, 1, { honba: 2 }, correctionOf(1))

    expect(again.audit).toHaveLength(2)
    expect(again.honba).toBe(2)
  })

  it('el conflicto se comprueba contra el registro guardado, no contra el parche', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.update(game.id, 1, { honba: 1 }, correctionOf(0))

    const error = await turnsRepository
      .update(game.id, 1, { honba: 7 }, correctionOf(7))
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('conflict')
  })
})

/**
 * RF-18.10: borrar un turno es una operación más de la partida, no un borrado a ciegas. Lo que se
 * re-deriva de los turnos siguientes es de `deleteTurn`, en la capa de `useGameTurns`: aquí el
 * repositorio borra, devuelve lo que había para el registro del borrado y refresca la partida.
 */
describe('T26 · remove', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('borrar el turno 5 de 10 lo elimina y deja los cinco siguientes intactos', async () => {
    const game = await seedGame()

    for (let turnNo = 1; turnNo <= 10; turnNo += 1) {
      await turnsRepository.create(game.id, turnInput(turnNo))
    }

    const deleted = await turnsRepository.remove(game.id, 5)
    const stored = await turnsRepository.list(game.id)

    expect(deleted.turnNo).toBe(5)
    expect(stored.map((turn) => turn.turnNo)).toStrictEqual([1, 2, 3, 4, 6, 7, 8, 9, 10])
    expect(await docData(game.id, '5')).toBeUndefined()
  })

  it('borrar el último turno permite volver a capturar ese mismo número', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))

    await turnsRepository.remove(game.id, 2)
    expect(await turnsRepository.nextNumber(game.id)).toBe(2)

    const recaptured = await turnsRepository.create(game.id, turnInput(2))

    expect(recaptured.turnNo).toBe(2)
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])
  })

  it('borrar devuelve el turno tal y como estaba, para el registro del borrado', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.update(game.id, 1, { honba: 4 }, correctionOf(0))

    const deleted = await turnsRepository.remove(game.id, 1)

    expect(deleted.honba).toBe(4)
    expect(deleted.audit).toHaveLength(1)
    expect(deleted.capturedBy).toBe('user-1')
  })

  it('borrar refresca updatedAt de la partida', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    fakeAdvanceSeconds(120)
    await turnsRepository.remove(game.id, 1)

    const stored = await gamesRepository.getById(game.id)

    expect(stored?.updatedAt.seconds).toBeGreaterThan(game.updatedAt.seconds)
  })

  it('borrar un turno que no existe lanza notFound', async () => {
    const game = await seedGame()

    const error = await turnsRepository.remove(game.id, 3).catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('notFound')
  })

  it('borrar sobre una partida finalizada o terminal se rechaza sin borrar nada', async () => {
    const finalized = await seedGame()
    await turnsRepository.create(finalized.id, turnInput(1))
    await gamesRepository.update(finalized.id, {
      status: 'finalized',
      results: [],
      finalizationAudit: [{ at: fakeNow(), by: 'user-1', action: 'finalize' }],
    })

    const closedError = await turnsRepository
      .remove(finalized.id, 1)
      .catch((caught: unknown) => caught)

    expect((closedError as DataError).code).toBe('finalizedGame')

    const terminal = await seedGame()
    await turnsRepository.create(terminal.id, turnInput(1))
    await gamesRepository.update(terminal.id, { status: 'aborted' })

    const terminalError = await turnsRepository.remove(terminal.id, 1).catch((c: unknown) => c)

    expect((terminalError as DataError).code).toBe('notOpen')
    expect((await turnsRepository.list(finalized.id)).map((turn) => turn.turnNo)).toStrictEqual([1])
    expect((await turnsRepository.list(terminal.id)).map((turn) => turn.turnNo)).toStrictEqual([1])
  })
})

/**
 * RF-19.14: el registro solo crece y Firestore admite 1 MiB por documento. Un turno corregido
 * muchas veces acabaría dejando de poderse guardar, y el fallo aparecería en la mesa con un
 * `failed-precondition` sin explicación. Aquí se rechaza antes, con un mensaje que nombra el turno.
 */
describe('T27 · límite de tamaño del documento', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('rechaza entera la corrección que superaría el límite y no escribe nada', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    setFatAudit(game.id, 1, FIRESTORE_DOCUMENT_LIMIT_BYTES)

    const error = await turnsRepository
      .update(game.id, 1, { honba: 7 }, correctionOf(1))
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).code).toBe('auditFull')
    expect((error as DataError).message).toContain('turno 1')

    const stored = await turnsRepository.list(game.id)

    expect(stored[0]?.honba).toBe(0)
    expect(stored[0]?.audit).toHaveLength(1)
  })

  it('acepta la corrección que deja el documento por debajo del límite', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const stored = fakeGetDb().docs.get(turnPath(game.id, 1))
    const payload = FIRESTORE_DOCUMENT_LIMIT_BYTES - JSON.stringify(stored ?? {}).length - 10_000

    expect(payload).toBeGreaterThan(0)
    setFatAudit(game.id, 1, payload)

    const corrected = await turnsRepository.update(game.id, 1, { honba: 7 }, correctionOf(1))

    expect(corrected.honba).toBe(7)
    expect(corrected.audit).toHaveLength(2)
  }, 60_000)

  it('el límite medido es el de Firestore: un MiB', () => {
    expect(FIRESTORE_DOCUMENT_LIMIT_BYTES).toBe(1_048_576)
  })
})

/**
 * Soporte de T29 y T30. RF-18.13 deja claro qué **no** se re-deriva, y el descartador y el que
 * hizo chombo están en esa lista: los escribió quien capturó. El problema es que sin ellos un ron
 * o un chombo guardado no se puede volver a resolver, así que `domain/replay.ts` no puede recorrer
 * el turno guardado tal cual. Estos dos campos son los que faltaban, y `capturedTurnOf` es el
 * adaptador que los lleva a la entrada del recorrido.
 */
describe('descartador y chombo: lo capturado que el recorrido necesita', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('create los guarda tal cual y list los devuelve', async () => {
    const game = await seedGame()

    const ron = await turnsRepository.create(game.id, {
      ...turnInput(1),
      resultType: 'ron',
      discarderId: toPlayerId('p3'),
      chomboId: null,
    })
    await turnsRepository.create(game.id, {
      ...turnInput(2),
      resultType: 'chombo',
      discarderId: null,
      chomboId: toPlayerId('p4'),
    })

    expect(ron.discarderId).toBe(toPlayerId('p3'))
    expect(ron.chomboId).toBeNull()
    expect(await storedField(game.id, 1, 'discarderId')).toBe('p3')
    expect(await storedField(game.id, 1, 'chomboId')).toBeNull()

    const stored = await turnsRepository.list(game.id)

    expect(stored[0]?.discarderId).toBe(toPlayerId('p3'))
    expect(stored[1]?.chomboId).toBe(toPlayerId('p4'))
  })

  it('un turno sin descartador ni chombo los guarda como null, no como ausencia', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    expect(await storedField(game.id, 1, 'discarderId')).toBeNull()
    expect(await storedField(game.id, 1, 'chomboId')).toBeNull()
  })

  it('son corregibles y quedan en el registro con su valor anterior', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { discarderId: toPlayerId('p2') },
      correctionOf(0),
    )

    expect(corrected.discarderId).toBe(toPlayerId('p2'))
    expect(correction(corrected.audit[0])?.changes).toStrictEqual([
      { field: 'discarderId', from: null, to: 'p2', derived: false },
    ])
  })

  it('capturedTurnOf proyecta el turno guardado a la entrada del recorrido', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, {
      ...turnInput(1),
      resultType: 'ron',
      discarderId: toPlayerId('p3'),
      yaku: ['riichi', 'tanyao'],
      yakuHan: 2,
      doraCount: 1,
      fu: 30,
      tenpai: [toPlayerId('p1'), toPlayerId('p2')],
      riichiDeclaredBy: [toPlayerId('p1')],
      value: [
        { playerId: toPlayerId('p2'), han: 3, fu: 30, basicPoints: 960, points: 3900, deltas: [] },
      ],
    })

    const stored = await turnsRepository.list(game.id)

    expect(capturedTurnOf(turnAt(stored, 0))).toStrictEqual({
      turnNo: 1,
      resultType: 'ron',
      hand: { yaku: ['riichi', 'tanyao'], yakuHan: 2, doraCount: 1, fu: 30 },
      winners: ['p2'],
      discarderId: 'p3',
      chomboId: null,
      tenpai: ['p1', 'p2'],
      riichiDeclaredBy: ['p1'],
    })
  })

  it('toTurnSnapshot deja los valores del turno y se lleva su registro y sus marcas', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), honba: 4 })
    await turnsRepository.update(game.id, 1, { honba: 5 }, correctionOf(0))

    const snapshot = toTurnSnapshot(turnAt(await turnsRepository.list(game.id), 0))

    expect(snapshot).toStrictEqual({ ...turnInput(1), honba: 5 })
    expect('audit' in snapshot).toBe(false)
    expect('createdAt' in snapshot).toBe(false)
    expect('updatedBy' in snapshot).toBe(false)
  })

  it('capturedTurnOf con parche proyecta el turno ya corregido, no el guardado', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const stored = await turnsRepository.list(game.id)

    expect(
      capturedTurnOf(turnAt(stored, 0), { resultType: 'chombo', chomboId: toPlayerId('p4') }),
    ).toMatchObject({
      resultType: 'chombo',
      chomboId: 'p4',
      discarderId: null,
    })
  })

  it('capturedTurnOf con un parche que pone null sí cambia el valor: null no es «no informado»', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), discarderId: toPlayerId('p3') })

    const stored = await turnsRepository.list(game.id)

    expect(capturedTurnOf(turnAt(stored, 0), { discarderId: null }).discarderId).toBeNull()
  })

  it('el recorrido acepta lo que sale del adaptador sin rechazarlo por incompleto', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), discarderId: toPlayerId('p3') })

    const stored = await turnsRepository.list(game.id)
    const result = replayTurns(
      tableAtStart(),
      stored.map((turn) => capturedTurnOf(turn)),
      1,
    )

    expect(result.ok).toBe(true)
  })

  it('sin descartador, un ron guardado es irreconstruible y el recorrido lo dice', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), resultType: 'ron' })

    const stored = await turnsRepository.list(game.id)
    const result = replayTurns(
      tableAtStart(),
      stored.map((turn) => capturedTurnOf(turn)),
      1,
    )

    expect(result).toStrictEqual({ ok: false, turnNo: 1, reason: 'incompleteTurn' })
  })
})

/**
 * Soporte de T30. Borrar un turno intermedio deja un hueco, y la numeración de la partida es
 * correlativa: si el hueco no se cierra, el turno borrado no se puede volver a capturar. Renumerar
 * no es un `update` —el identificador del documento también cambia—, y el registro del borrado
 * (RF-19.6) vive en el turno anterior, que tampoco cambia ningún campo.
 */
describe('renumerar un turno y anotar el borrado del siguiente', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('moveToTurnNo escribe el turno en el identificador nuevo y borra el viejo', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))

    const moved = await turnsRepository.update(
      game.id,
      2,
      { honba: 3 },
      { ...correctionOf(0), moveToTurnNo: 1 },
    )

    expect(moved.turnNo).toBe(1)

    const stored = await turnsRepository.list(game.id)

    expect(stored).toHaveLength(1)
    expect(stored[0]?.turnNo).toBe(1)
    expect(stored[0]?.honba).toBe(3)
    expect(await docData(game.id, '2')).toBeUndefined()
  })

  it('renumerar conserva quién capturó el turno y su registro anterior', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))
    await turnsRepository.update(game.id, 2, { fu: 30 }, correctionOf(0))
    await turnsRepository.update(game.id, 2, { fu: 40 }, correctionOf(1))

    const moved = await turnsRepository.update(
      game.id,
      2,
      { fu: 50 },
      { ...correctionOf(2), moveToTurnNo: 1 },
    )

    expect(moved.turnNo).toBe(1)
    expect(moved.capturedBy).toBe('user-1')
    expect(moved.audit).toHaveLength(3)
    expect(moved.audit.map((entry) => entry.action)).toStrictEqual([
      'correct',
      'correct',
      'correct',
    ])
  })

  it('un turno renumerado que no cambia de valor conserva quién lo corrigió por última vez', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))
    await turnsRepository.update(game.id, 2, { fu: 30 }, correctionOf(0, { by: 'user-9' }))

    const moved = await turnsRepository.update(
      game.id,
      2,
      { fu: 30 },
      { ...correctionOf(1), moveToTurnNo: 1 },
    )

    expect(moved.audit).toHaveLength(1)
    expect(moved.updatedBy).toBe('user-9')
    expect(await storedField(game.id, 1, 'updatedBy')).toBe('user-9')
  })

  it('deletedTurn anota el borrado del siguiente en el registro de este turno', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    const second = await turnsRepository.create(game.id, turnInput(2))

    const annotated = await turnsRepository.update(
      game.id,
      1,
      { honba: 0 },
      {
        ...correctionOf(0, { by: 'user-2' }),
        deletedTurn: { turnNo: 2, before: toTurnSnapshot(second) },
      },
    )

    expect(annotated.audit).toHaveLength(1)
    expect(annotated.audit[0]).toStrictEqual({
      at: fakeNow(),
      by: 'user-2',
      action: 'delete',
      turnNo: 2,
      before: toTurnSnapshot(second),
    })
  })

  it('el registro del borrado no exime de la lectura-verificación', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))
    await turnsRepository.update(game.id, 1, { fu: 10 }, correctionOf(0))

    const second = turnAt(await turnsRepository.list(game.id), 1)

    const error = await turnsRepository
      .update(
        game.id,
        1,
        { fu: 20 },
        {
          ...correctionOf(0),
          deletedTurn: { turnNo: 2, before: toTurnSnapshot(second) },
        },
      )
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('conflict')
  })

  it('el turno renumerado que un borrado deja libre tiene su captura intacta', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))
    await turnsRepository.create(game.id, turnInput(3))

    await turnsRepository.remove(game.id, 2)
    await turnsRepository.update(game.id, 3, { honba: 2 }, { ...correctionOf(0), moveToTurnNo: 2 })

    const stored = await turnsRepository.list(game.id)

    expect(stored.map((turn) => turn.turnNo)).toStrictEqual([1, 2])
    expect(stored[1]?.honba).toBe(2)
    expect(await turnsRepository.nextNumber(game.id)).toBe(3)
  })
})

/**
 * T36 · RF-22.9. El `han` del turno es **salida**: sale de `sumYakuHan` sobre los yaku marcados. Lo
 * que una persona escribe a mano es un **delta** sobre esa suma, en `yakuHanOverride`, y no un
 * segundo total: guardarlo aparte es lo que permite distinguir qué aportó el catálogo de qué
 * aportó la persona, y lo que deja el total derivable.
 */
describe('T36 · yakuHanOverride: el ajuste a mano como delta', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('create guarda el ajuste, y cero cuando no hay ninguno', async () => {
    const game = await seedGame()

    const plain = await turnsRepository.create(game.id, turnInput(1))
    const adjusted = await turnsRepository.create(game.id, {
      ...turnInput(2),
      yakuHanOverride: -1,
    })

    expect(plain.yakuHanOverride).toBe(0)
    expect(adjusted.yakuHanOverride).toBe(-1)
    expect(await storedField(game.id, 1, 'yakuHanOverride')).toBe(0)
    expect(await storedField(game.id, 2, 'yakuHanOverride')).toBe(-1)
  })

  it('un turno escrito antes del campo se lee con el ajuste en cero', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    const path = turnPath(game.id, 1)
    const stored = fakeGetDb().docs.get(path)

    if (stored === undefined) {
      throw new Error('no hay turno que envejecer')
    }

    const { yakuHanOverride: _dropped, ...legacy } = stored

    fakeGetDb().docs.set(path, legacy)

    expect((await turnsRepository.list(game.id))[0]?.yakuHanOverride).toBe(0)
  })

  it('es corregible y queda en el registro con su valor anterior', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { yakuHanOverride: 2 },
      correctionOf(0),
    )

    expect(corrected.yakuHanOverride).toBe(2)
    expect(correction(corrected.audit[0])?.changes).toStrictEqual([
      { field: 'yakuHanOverride', from: 0, to: 2, derived: false },
    ])
  })

  it('volver a poner el mismo ajuste no deja entrada', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), yakuHanOverride: 2 })

    const corrected = await turnsRepository.update(
      game.id,
      1,
      { yakuHanOverride: 2 },
      correctionOf(0),
    )

    expect(corrected.audit).toStrictEqual([])
  })
})

/**
 * RF-18.18 con la única excepción que lo hace coherente. Una partida marcada porque alguien quedó
 * por debajo de cero solo admite finalizarse; borrar correcciones está vetado, y **borrar su último
 * turno no**: ese borrado es lo que puede levantar la marca (caso límite 18 y RF-18.19), así que con
 * el veto entero la marca no se levantaría nunca.
 *
 * El veto vive en `data/` porque es un invariante del documento, y la excepción se pide y se
 * comprueba: `remove` lee los turnos y verifica que el borrado sea de verdad el último. Lo que la
 * marca se levante o no es de `domain/replay.ts`, y lo decide `useGameTurns`.
 */
describe('RF-18.18 · una partida marcada por bancarrota solo admite el borrado de su último turno', () => {
  beforeEach(() => {
    fakeReset()
  })

  async function markedGame(turnCount: number) {
    const game = await seedGame()

    for (let turnNo = 1; turnNo <= turnCount; turnNo += 1) {
      await turnsRepository.create(game.id, turnInput(turnNo))
    }

    await gamesRepository.update(game.id, { mustFinalize: true })

    return game
  }

  const BANKRUPTCY = 'La partida está marcada por bancarrota: solo se puede finalizar'

  it('create se rechaza con gameMarked', async () => {
    const game = await markedGame(1)

    const error = await turnsRepository
      .create(game.id, turnInput(2))
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('gameMarked')
    expect((error as DataError).message).toBe(BANKRUPTCY)
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1])
  })

  it('update se rechaza con gameMarked, y con él el renumerado', async () => {
    const game = await markedGame(3)

    const corrected = await turnsRepository
      .update(game.id, 1, { honba: 1 }, correctionOf(0))
      .catch((caught: unknown) => caught)
    const moved = await turnsRepository
      .update(game.id, 3, { honba: 1 }, { ...correctionOf(0), moveToTurnNo: 2 })
      .catch((caught: unknown) => caught)

    expect((corrected as DataError).code).toBe('gameMarked')
    expect((corrected as DataError).message).toBe(BANKRUPTCY)
    expect((moved as DataError).code).toBe('gameMarked')
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([
      1, 2, 3,
    ])
  })

  it('remove se rechaza mientras no sea el último turno', async () => {
    const game = await markedGame(3)

    const plain = await turnsRepository.remove(game.id, 2).catch((caught: unknown) => caught)
    const claimed = await turnsRepository
      .remove(game.id, 2, undefined, { waivesBankruptcy: true })
      .catch((caught: unknown) => caught)

    expect((plain as DataError).code).toBe('gameMarked')
    expect((plain as DataError).message).toBe(BANKRUPTCY)
    // Pedir la excepción no la concede: aquí el turno borrado no es el último, y el motivo es otro.
    expect((claimed as DataError).code).toBe('notLastTurn')
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([
      1, 2, 3,
    ])
  })

  it('borrar el último turno de una partida marcada sí se acepta', async () => {
    const game = await markedGame(3)

    const deleted = await turnsRepository.remove(game.id, 3, undefined, {
      waivesBankruptcy: true,
    })

    expect(deleted.turnNo).toBe(3)
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])
  })

  it('una partida no marcada no necesita pedir la excepción para nada', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))
    await turnsRepository.create(game.id, turnInput(2))

    await turnsRepository.remove(game.id, 1)
    await turnsRepository.remove(game.id, 2, undefined, { waivesBankruptcy: true })

    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([])
  })

  it('la anotación del borrado en el turno anterior tampoco la veta', async () => {
    const game = await markedGame(2)
    const second = await turnsRepository.remove(game.id, 2, undefined, { waivesBankruptcy: true })

    const annotated = await turnsRepository.update(
      game.id,
      1,
      { honba: 0 },
      {
        ...correctionOf(0, { by: 'user-2' }),
        deletedTurn: { turnNo: 2, before: toTurnSnapshot(second) },
      },
    )

    expect(annotated.audit).toHaveLength(1)
    expect(annotated.audit[0]?.action).toBe('delete')
  })

  it('el veto de la bancarrota no tapa el de una partida finalizada', async () => {
    const game = await markedGame(1)
    await gamesRepository.update(game.id, {
      status: 'finalized',
      results: [],
      finalizationAudit: [{ at: fakeNow(), by: 'user-1', action: 'finalize' }],
    })

    const error = await turnsRepository.remove(game.id, 1).catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('finalizedGame')
  })
})

/**
 * T02 · RF-30.5 y RF-19.11 de `specs/002`: el registro de correcciones **no lleva campo de motivo**.
 * No es una convención de estilo —en una corrección de captura el diff ya dice qué pasó—, sino algo
 * que hay que **afirmar**: añadir `reason` al tipo sería un cambio de una línea que ningún otro test
 * detectaría, porque nadie llega a escribirlo. La aserción de tipo vive en
 * `turns.repository.test-d.ts` (constitution VI.1); aquí se comprueba que la lista de campos
 * corregibles y las dos clases de entrada que se escriben no lo traen.
 */
describe('sin campo de motivo', () => {
  beforeEach(() => {
    fakeReset()
  })

  /** Cualquier nombre de campo que suene a motivo, en el idioma del repositorio y en el del club. */
  const RAZON = /reason|razon|motivo|motive|why|porque/iu

  it('ni la lista de campos corregibles ni las entradas del registro lo declaran', async () => {
    expect(TURN_PATCH_FIELDS.filter((field) => RAZON.test(field))).toStrictEqual([])

    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), fu: 20 })
    await turnsRepository.create(game.id, turnInput(2))

    const corregido = await turnsRepository.update(game.id, 1, { fu: 30 }, correctionOf(0))
    const borrable = turnAt(await turnsRepository.list(game.id), 1)

    await turnsRepository.remove(game.id, 2)

    /**
     * El borrado del turno siguiente vive en el registro del anterior (RF-19.6), así que las dos
     * clases de entrada del mismo array se comprueban juntas: `audit[]` es una unión y ninguna de sus
     * dos ramas puede llevar motivo.
     */
    const conBorrado = await turnsRepository.update(
      game.id,
      1,
      { honba: 0 },
      {
        by: 'user-3',
        expectedAuditCount: corregido.audit.length,
        deletedTurn: { turnNo: 2, before: toTurnSnapshot(borrable) },
      },
    )

    const entradaDeCorreccion = correction(conBorrado.audit[0])
    const entradaDeBorrado = conBorrado.audit[1]

    expect(Object.keys(entradaDeCorreccion ?? {})).not.toContain('reason')
    expect(entradaDeCorreccion?.changes.every((change) => !('reason' in change))).toBe(true)

    if (entradaDeBorrado === undefined || entradaDeBorrado.action !== 'delete') {
      throw new Error('el registro no guardó la entrada del borrado del turno 2')
    }

    expect(Object.keys(entradaDeBorrado)).not.toContain('reason')
    expect(Object.keys(entradaDeBorrado.before)).not.toContain('reason')
  })
})

/**
 * T04 y T05 · RF-30.1 a RF-30.3. Los valores que un turno tenía **antes de su última corrección** se
 * leen de la entrada más reciente del registro, y solo de sus campos **capturados**: los derivados —
 * ronda, localía, contador, valores de la mano y deltas— no se restituyen porque los recalcula el
 * sistema (RF-18.13), y volver a escribir a mano un valor calculado contradice esa regla en el mismo
 * cambio que la cumple.
 *
 * Por eso «reconstruir la versión anterior» no es un deshacer campo a campo: es un **recorrido**. Lo
 * repone `capturedFieldsBefore`, y lo demás sale de volver a derivar la partida.
 */
describe('versión anterior de un turno', () => {
  beforeEach(() => {
    fakeReset()
  })

  /** La partida con la que se reconstruye: con chombo, porque es lo único que deja la localía quieta. */
  const PARTIDA = conIdsDe(PARTIDA_CON_CHOMBO, tableAtStart())

  /**
   * Captura la partida completa con lo que el recorrido calcula, como haría el formulario: los
   * derivados no se escriben a mano porque no se pueden conocer antes de recorrer (RF-18.13), y los
   * ganadores viajan en `value[]` porque es de ahí de donde `capturedTurnOf` los lee.
   */
  async function guardarPartida(gameId: GameId, partida: readonly CapturedTurn[]): Promise<void> {
    const recorrido = replayTurns(tableAtStart(), partida, 1)

    if (!recorrido.ok) {
      throw new Error(`la partida no se puede recorrer: ${recorrido.reason}`)
    }

    for (const [index, derivado] of recorrido.outcome.turns.entries()) {
      const captured = partida[index]

      if (captured === undefined) {
        throw new Error(`el recorrido devolvió el turno ${derivado.turnNo} sin captura`)
      }

      await turnsRepository.create(gameId, {
        turnNo: derivado.turnNo,
        wind: derivado.wind,
        dealerId: derivado.dealerId,
        honba: derivado.honba,
        resultType: captured.resultType,
        yaku: [...captured.hand.yaku],
        yakuHan: captured.hand.yakuHan,
        yakuHanOverride: 0,
        doraCount: captured.hand.doraCount,
        fu: captured.hand.fu,
        tenpai: [...captured.tenpai],
        riichiDeclaredBy: [...captured.riichiDeclaredBy],
        riichiSticks: derivado.riichiSticks,
        value: derivado.values,
        deltas: derivado.deltas,
        capturedBy: 'user-1',
        isRenchan: false,
        isFinalTurn: false,
        discarderId: captured.discarderId,
        chomboId: captured.chomboId,
      })
    }
  }

  /**
   * El recorrido de la partida tal y como está escrita, con el adaptador de `data/`. `correccion`
   * simula el parche de quien corrige: el turno indicado entra ya corregido en el recorrido, que es
   * lo que hace `useGameTurns.correctTurn` (RF-18.7).
   */
  function recorrer(
    turns: readonly TurnRecord[],
    correccion?: { readonly turnNo: number; readonly patch: UpdateTurnPatch },
  ): readonly ReplayedTurn[] {
    const result = replayTurns(
      tableAtStart(),
      turns.map((turn) =>
        correccion !== undefined && turn.turnNo === correccion.turnNo
          ? capturedTurnOf(turn, correccion.patch)
          : capturedTurnOf(turn),
      ),
      1,
    )

    if (!result.ok) {
      throw new Error(
        `la partida no se puede recorrer: ${result.reason} en el turno ${result.turnNo}`,
      )
    }

    return result.outcome.turns
  }

  function delTurno(turns: readonly ReplayedTurn[], turnNo: number): ReplayedTurn {
    const found = turns.find((turn) => turn.turnNo === turnNo)

    if (found === undefined) {
      throw new Error(`el recorrido no devolvió el turno ${turnNo}`)
    }

    return found
  }

  /** El turno con los valores que tenían sus campos capturados antes de la última corrección. */
  function restaurado(turn: TurnRecord): TurnRecord {
    return { ...turn, ...capturedFieldsBefore(turn) }
  }

  /**
   * Corrige como lo hace `useGameTurns.correctTurn`: el parche de quien corrige **más** los derivados
   * que el recorrido acaba de calcular (RF-18.8). Es lo que hace que el turno corregido guarde en su
   * registro tanto el campo capturado como los derivados que cambiaron con él.
   */
  async function corregir(
    gameId: GameId,
    turnNo: number,
    patch: UpdateTurnPatch,
  ): Promise<TurnRecord> {
    const stored = await turnsRepository.list(gameId)
    const objetivo = stored.find((turn) => turn.turnNo === turnNo)

    if (objetivo === undefined) {
      throw new Error(`no hay turno ${turnNo} que corregir`)
    }

    const own = delTurno(recorrer(stored, { turnNo, patch }), turnNo)

    return turnsRepository.update(
      gameId,
      turnNo,
      {
        ...patch,
        wind: own.wind,
        dealerId: own.dealerId,
        honba: own.honba,
        riichiSticks: own.riichiSticks,
        value: own.values,
        deltas: own.deltas,
      },
      correctionOf(objetivo.audit.length, {
        by: 'user-que-corrige',
        derived: ['wind', 'dealerId', 'honba', 'riichiSticks', 'value', 'deltas'],
      }),
    )
  }

  /** Los turnos guardados, con el indicado restituido a su versión anterior. */
  function conTurnoRestaurado(
    stored: readonly TurnRecord[],
    turnNo: number,
  ): readonly TurnRecord[] {
    return stored.map((turn) => (turn.turnNo === turnNo ? restaurado(turn) : turn))
  }

  it('devuelve el valor anterior de un campo capturado', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), doraCount: 1, fu: 20 })

    const corregido = await turnsRepository.update(game.id, 1, { fu: 30 }, correctionOf(0))

    expect(capturedFieldsBefore(corregido)).toStrictEqual({ fu: 20 })
  })

  it('devuelve los de dos campos corregidos a la vez', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, {
      ...turnInput(1),
      doraCount: 1,
      fu: 20,
      tenpai: [P1],
    })

    const corregido = await turnsRepository.update(
      game.id,
      1,
      { tenpai: [P1, toPlayerId('p2')], fu: 30, doraCount: 2 },
      correctionOf(0),
    )

    expect(capturedFieldsBefore(corregido)).toStrictEqual({ doraCount: 1, fu: 20, tenpai: [P1] })
  })

  it('una corrección que solo tocó derivados devuelve vacío', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corregido = await turnsRepository.update(
      game.id,
      1,
      {
        wind: 'south',
        dealerId: toPlayerId('p2'),
        honba: 2,
        value: [
          {
            playerId: toPlayerId('p2'),
            han: 2,
            fu: 30,
            basicPoints: 640,
            points: 2600,
            deltas: [],
          },
        ],
        deltas: [{ playerId: toPlayerId('p2'), delta: 2600 }],
      },
      correctionOf(0, { derived: ['wind', 'dealerId', 'honba', 'value', 'deltas'] }),
    )

    expect(changedFields(corregido.audit[0])).toStrictEqual([
      'wind',
      'dealerId',
      'honba',
      'value',
      'deltas',
    ])
    expect(capturedFieldsBefore(corregido)).toStrictEqual({})
  })

  /**
   * El **bote de riichi** es un derivado más, y de los que la spec enumera peor: RF-18.8 lo cuenta
   * con la ronda, la localía, el contador, el valor de la mano y los deltas, y `useGameTurns` lo marca
   * como `derived` en cada corrección porque lo recalcula el recorrido. El enumerado de RF-30.2 no lo
   * menciona, y por eso la lista de derivados de este módulo se le quedó corta: `riichiSticks` se
   * colaba como si lo hubiera escrito una persona.
   *
   * Devolverlo es restituir un valor calculado a mano, que es justo lo que RF-30.2 veta en el mismo
   * cambio que lo cumple (plan.md §5.1, decisión 1). El caso no es raro: un turno con riichi
   * declarado lleva el bote consigo, así que cualquier corrección de ese turno lo toca.
   */
  it('una corrección que solo tocó el bote de riichi devuelve vacío', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, turnInput(1))

    const corregido = await turnsRepository.update(
      game.id,
      1,
      { riichiSticks: 1 },
      correctionOf(0, { derived: ['riichiSticks'] }),
    )

    expect(changedFields(corregido.audit[0])).toStrictEqual(['riichiSticks'])
    expect(capturedFieldsBefore(corregido)).toStrictEqual({})
  })

  it('un borrado anotado no tacha la última corrección', async () => {
    const game = await seedGame()
    await turnsRepository.create(game.id, { ...turnInput(1), fu: 20 })
    await turnsRepository.create(game.id, turnInput(2))

    const corregido = await turnsRepository.update(game.id, 1, { fu: 30 }, correctionOf(0))
    const borrable = turnAt(await turnsRepository.list(game.id), 1)

    await turnsRepository.remove(game.id, 2)

    const conBorrado = await turnsRepository.update(
      game.id,
      1,
      { honba: 0 },
      {
        by: 'user-3',
        expectedAuditCount: corregido.audit.length,
        deletedTurn: { turnNo: 2, before: toTurnSnapshot(borrable) },
      },
    )

    const guardado = turnAt(await turnsRepository.list(game.id), 0)

    // El borrado del turno siguiente no cambia ningún campo de este, así que no puede hacer de
    // pantalla de la entrada de corrección que sí los cambió.
    expect(conBorrado.audit.at(-1)?.action).toBe('delete')
    expect(capturedFieldsBefore(guardado)).toStrictEqual({ fu: 20 })
  })

  it('los derivados de la versión anterior salen de recorrer la partida, no del registro', async () => {
    const game = await seedGame()

    await guardarPartida(game.id, PARTIDA)

    // La partida tal y como se capturó: la referencia contra la que se juzga la reconstrucción.
    const referencia = recorrer(await turnsRepository.list(game.id))

    /**
     * El turno 3 es un tsumo de la localía. Cambiarle las dora cambia lo que cobra y lo que pagan los
     * otros tres, así que sus derivados cambian aunque la captura no los mencione.
     */
    const corregido = await corregir(game.id, 3, { doraCount: 5 })
    const cambios = correction(corregido.audit[0])?.changes ?? []

    expect(cambios.map((change) => change.field)).toContain('doraCount')
    // Los derivados que cambiaron también quedan anotados: son la tentación de la que RF-30.2 protege.
    expect(cambios.some((change) => change.derived)).toBe(true)

    // Lo que devuelve `capturedFieldsBefore` es **solo** el campo capturado.
    expect(capturedFieldsBefore(corregido)).toStrictEqual({ doraCount: 0 })

    const corregidos = await turnsRepository.list(game.id)
    const reconstruido = recorrer(conTurnoRestaurado(corregidos, 3))

    // Reponer el campo capturado y volver a derivar reproduce la partida de antes de la corrección,
    // no el documento corregido.
    expect(reconstruido).toStrictEqual(referencia)
    expect(reconstruido).not.toStrictEqual(recorrer(corregidos))

    /**
     * Un turno anterior cambia **después**. El `from` que el registro del turno 3 tiene anotado para
     * sus derivados era un valor calculado bajo el estado viejo, así que a estas alturas ya está
     * viejo: aplicarlo daría un turno que no cuadra con la partida en la que se está reconstruyendo.
     * Por eso la reconstrucción no lo usa, y por eso el cambio de después no la invalida.
     */
    await corregir(game.id, 1, { tenpai: PLAYERS.map((player) => player.playerId) })

    const despues = await turnsRepository.list(game.id)
    const trasElCambio = recorrer(conTurnoRestaurado(despues, 3))
    const delTerceroAnotado = cambios.find((change) => change.field === 'deltas')?.from

    expect(capturedFieldsBefore(turnAt(despues, 2))).toStrictEqual({ doraCount: 0 })
    expect(trasElCambio).not.toStrictEqual(recorrer(despues))
    expect(delTurno(trasElCambio, 3).deltas).not.toStrictEqual(delTerceroAnotado)
  })
})
