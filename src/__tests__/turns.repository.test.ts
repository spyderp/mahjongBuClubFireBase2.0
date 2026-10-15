import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { gamesRepository } from '@/data/games.repository'
import { DataError } from '@/data/errors'
import { turnsRepository } from '@/data/turns.repository'
import type { CreateTurnInput } from '@/data/turns.repository'
import { toGameId, toPlayerId } from '@/domain/types'
import type { Seat } from '@/domain/types'
import { fakeAdvanceSeconds, fakeNow, fakeReset } from '@/test-utils/fakeFirestore'

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

describe('T63 · turns.repository', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('nextNumber de una partida sin turnos es 1', async () => {
    const game = await seedGame()

    expect(await turnsRepository.nextNumber(game.id)).toBe(1)
  })

  it('create guarda el turno con id rellenado a dos dígitos y devuelve el registro', async () => {
    const game = await seedGame()
    const created = await turnsRepository.create(game.id, turnInput(1))

    expect(created.turnNo).toBe(1)
    expect((await turnsRepository.list(game.id))[0]?.turnNo).toBe(1)

    const snapshot = await getDoc(doc(getDb(), 'games', game.id, 'turns', '01'))
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

    const updated = await turnsRepository.update(game.id, 1, { honba: 2, capturedBy: 'otro' })

    expect(updated.honba).toBe(2)
    expect(updated.capturedBy).toBe('otro')

    const missing = await turnsRepository
      .update(game.id, 99, { honba: 1 })
      .catch((caught: unknown) => caught)
    expect((missing as DataError).code).toBe('notFound')

    const finalized = await seedGame()
    await gamesRepository.update(finalized.id, {
      status: 'finalized',
      results: [],
      finalizationAudit: [{ at: fakeNow(), by: 'user-1', action: 'finalize' }],
    })
    const terminal = await turnsRepository
      .update(finalized.id, 1, { honba: 1 })
      .catch((caught: unknown) => caught)
    expect((terminal as DataError).code).toBe('finalizedGame')
  })
})
