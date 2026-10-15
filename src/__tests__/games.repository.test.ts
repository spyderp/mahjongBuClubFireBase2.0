import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gamesRepository } from '@/data/games.repository'
import type { CreateGameInput, GameAuditEntry, GameResultDoc } from '@/data/games.repository'
import { DataError } from '@/data/errors'
import { toGameId, toPlayerId, toSeasonId } from '@/domain/types'
import type { GameId, Seat } from '@/domain/types'
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

const SEATS: readonly Seat[] = ['east', 'south', 'west', 'north']
const PLAYERS = SEATS.map((seat, index) => ({
  playerId: toPlayerId(`p${index + 1}`),
  seat,
}))

function audit(action: 'finalize' | 'unfinalize', by = 'user-1'): GameAuditEntry {
  return { at: fakeNow(), by, action }
}

const RESULT: GameResultDoc = {
  playerId: toPlayerId('p1'),
  playerName: 'Ana',
  seat: 'east',
  finalScore: 33000,
  finalPosition: '1st',
  uma: 20,
  chombo: false,
  bankrupt: false,
}

async function openGame(overrides?: Partial<CreateGameInput>) {
  return gamesRepository.create({
    seasonId: overrides?.seasonId ?? null,
    date: overrides?.date ?? atDay(1),
    gameLength: 'tonpuusen',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: overrides?.startPoints ?? 25000,
    players: PLAYERS,
  })
}

async function finalizedGame(gameId: GameId) {
  return gamesRepository.update(gameId, {
    status: 'finalized',
    results: [RESULT],
    finalizationAudit: [audit('finalize')],
  })
}

describe('T62 · games.repository', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('create abre la partida y guarda la mesa completa', async () => {
    const season = toSeasonId('s1')
    const game = await openGame({ seasonId: season, date: atDay(5) })
    const stored = await gamesRepository.getById(game.id)

    expect(stored).not.toBeNull()
    expect(stored?.seasonId).toBe(season)
    expect(stored?.date).toEqual(atDay(5))
    expect(stored?.gameLength).toBe('tonpuusen')
    expect(stored?.rulesetVersion).toBe('1.0')
    expect(stored?.startPoints).toBe(25000)
    expect(stored?.status).toBe('open')
    expect(stored?.mustFinalize).toBe(false)
    expect(stored?.players).toHaveLength(4)
    expect(stored?.results).toEqual([])
    expect(stored?.finalizationAudit).toEqual([])
  })

  it('getById devuelve null cuando la partida no existe', async () => {
    expect(await gamesRepository.getById(toGameId('no-existe'))).toBeNull()
  })

  it('listBySeason devuelve solo las de la temporada, ordenadas por fecha descendente', async () => {
    const season = toSeasonId('s1')
    const early = await openGame({ seasonId: season, date: atDay(1) })
    const late = await openGame({ seasonId: season, date: atDay(3) })
    await openGame({ seasonId: null, date: atDay(2) })

    const games = await gamesRepository.listBySeason(season)

    expect(games.map((game) => game.id)).toEqual([late.id, early.id])
  })

  it('listOpen devuelve solo partidas abiertas, por updatedAt descendente', async () => {
    const first = await openGame()
    fakeAdvanceSeconds(300)
    const second = await openGame()
    fakeAdvanceSeconds(300)
    await gamesRepository.update(first.id, { mustFinalize: true })
    const finished = await openGame()
    await finalizedGame(finished.id)

    const open = await gamesRepository.listOpen()

    expect(open.map((game) => game.id)).toEqual([first.id, second.id])
    expect(open.map((game) => game.status)).toEqual(['open', 'open'])
    expect(open.map((game) => game.id)).not.toContain(finished.id)
  })

  it('update de una partida abierta aplica el parche y refresca updatedAt', async () => {
    const game = await openGame()

    fakeAdvanceSeconds(90)

    const updated = await gamesRepository.update(game.id, {
      startPoints: 30000,
      mustFinalize: true,
      results: [RESULT],
    })

    expect(updated.startPoints).toBe(30000)
    expect(updated.mustFinalize).toBe(true)
    expect(updated.results).toHaveLength(1)
    expect(updated.updatedAt.seconds).toBeGreaterThan(game.updatedAt.seconds)
  })

  it('update de una partida finalizada rechaza cualquier cambio que no sea deshacer', async () => {
    const game = await openGame()
    await finalizedGame(game.id)

    const error = await gamesRepository
      .update(game.id, { startPoints: 30000 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).code).toBe('finalizedGame')
  })

  it('update permite deshacer la finalización añadiendo la auditoría unfinalize', async () => {
    const game = await openGame()
    await finalizedGame(game.id)
    const stored = await gamesRepository.getById(game.id)

    const withAudit = await gamesRepository.update(game.id, {
      status: 'open',
      finalizationAudit: [...(stored?.finalizationAudit ?? []), audit('unfinalize')],
    })

    expect(withAudit.status).toBe('open')
    expect(withAudit.finalizationAudit).toHaveLength(2)
    expect(withAudit.finalizationAudit[1]?.action).toBe('unfinalize')
  })

  it('update de una partida terminal lanza DataError notOpen', async () => {
    const unfinished = await openGame()
    await gamesRepository.update(unfinished.id, { status: 'unfinished' })
    const firstError = await gamesRepository
      .update(unfinished.id, { startPoints: 30000 })
      .catch((caught: unknown) => caught)
    expect((firstError as DataError).code).toBe('notOpen')

    const aborted = await openGame()
    await gamesRepository.update(aborted.id, { status: 'aborted' })
    const secondError = await gamesRepository
      .update(aborted.id, { startPoints: 30000 })
      .catch((caught: unknown) => caught)
    expect((secondError as DataError).code).toBe('notOpen')
  })

  it('remove solo funciona sobre partidas abiertas', async () => {
    const open = await openGame()
    await gamesRepository.remove(open.id)
    expect(await gamesRepository.getById(open.id)).toBeNull()

    const finished = await openGame()
    await finalizedGame(finished.id)
    const error = await gamesRepository.remove(finished.id).catch((caught: unknown) => caught)
    expect((error as DataError).code).toBe('notOpen')

    const missing = await gamesRepository
      .remove(toGameId('no-existe'))
      .catch((caught: unknown) => caught)
    expect((missing as DataError).code).toBe('notFound')
  })

  it('listOpen lleva el comentario del índice compuesto', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/data/games.repository.ts'), 'utf8')

    expect(source).toContain('games (status ASC, updatedAt DESC)')
  })
})
