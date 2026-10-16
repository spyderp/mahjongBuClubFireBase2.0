import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { gamesRepository } from '@/data/games.repository'
import type { CreateGameInput, GameAuditEntry, GameResultDoc } from '@/data/games.repository'
import { DataError } from '@/data/errors'
import type { TurnDeleteEntry, TurnSnapshot } from '@/data/turns.repository'
import { toGameId, toPlayerId, toSeasonId } from '@/domain/types'
import type { GameId, Seat } from '@/domain/types'
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

/** Los valores que tenía un turno, que es lo que queda de él cuando se borra (RF-19.6). */
const TURN_BEFORE: TurnSnapshot = {
  turnNo: 1,
  wind: 'east',
  dealerId: toPlayerId('p1'),
  honba: 2,
  resultType: 'chombo',
  yaku: [],
  yakuHan: 0,
  yakuHanOverride: 0,
  doraCount: 0,
  fu: 0,
  tenpai: [],
  riichiDeclaredBy: [],
  riichiSticks: 0,
  value: [],
  deltas: [{ playerId: toPlayerId('p4'), delta: -8000 }],
  discarderId: null,
  chomboId: toPlayerId('p4'),
  capturedBy: 'user-1',
  isRenchan: false,
  isFinalTurn: false,
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

function gamePath(gameId: string): string {
  return `games/${gameId}`
}

async function gameField(gameId: string, field: string): Promise<unknown> {
  const snapshot = await getDoc(doc(getDb(), 'games', gameId))

  return snapshot.data()?.[field]
}

/** Una entrada de `turnAudit[]`: el registro de un borrado sin turno anterior (RF-19.7). */
function deletion(turnNo: number): TurnDeleteEntry {
  return {
    at: fakeNow(),
    by: 'user-2',
    action: 'delete',
    turnNo,
    before: { ...TURN_BEFORE, turnNo },
  }
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

/**
 * T28 · RF-19.7: `games/{gameId}.turnAudit[]` es el único sitio donde puede sobrevivir el registro
 * de un borrado de turno **sin turno anterior**, porque el propio borrado se lo lleva por delante
 * si lived en el turno. No es un historial de revisiones de la partida —ese es `finalizationAudit[]`—,
 * sino el destino de una entrada que no tiene otro hogar, y por eso no se mezcla con él.
 */
describe('T28 · turnAudit[] en el documento de la partida', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('create abre la partida con el registro de borrados vacío', async () => {
    const created = await openGame()

    expect(created.turnAudit).toEqual([])
    expect((await gamesRepository.getById(created.id))?.turnAudit).toEqual([])
    expect(await gameField(created.id, 'turnAudit')).toEqual([])
  })

  it('update escribe el registro de un borrado y lo devuelve', async () => {
    const game = await openGame()

    const updated = await gamesRepository.update(game.id, { turnAudit: [deletion(1)] })

    expect(updated.turnAudit).toHaveLength(1)
    expect(updated.turnAudit[0]).toStrictEqual(deletion(1))
    expect((await gamesRepository.getById(game.id))?.turnAudit).toHaveLength(1)
  })

  it('el registro de la partida es de solo anexado: el llamante decide la lista entera', async () => {
    const game = await openGame()

    await gamesRepository.update(game.id, { turnAudit: [deletion(1)] })
    const second = await gamesRepository.update(game.id, { turnAudit: [deletion(1), deletion(2)] })

    expect(second.turnAudit.map((entry) => entry.turnNo)).toStrictEqual([1, 2])
  })

  it('un parche que no habla del registro no lo borra', async () => {
    const game = await openGame()
    await gamesRepository.update(game.id, { turnAudit: [deletion(1)] })

    const updated = await gamesRepository.update(game.id, { startPoints: 30000 })

    expect(updated.turnAudit).toHaveLength(1)
  })

  it('la entrada guarda los valores del turno borrado, no solo su número', async () => {
    const game = await openGame()
    const entry = deletion(3)

    await gamesRepository.update(game.id, { turnAudit: [entry] })
    const stored = await gamesRepository.getById(game.id)

    expect(stored?.turnAudit[0]?.before).toStrictEqual(entry.before)
    expect(stored?.turnAudit[0]?.before.resultType).toBe('chombo')
    expect(stored?.turnAudit[0]?.before.honba).toBe(2)
  })

  it('una partida escrita sin el campo se lee con la lista vacía, no con undefined', async () => {
    const game = await openGame()
    const { turnAudit: _omitted, ...rest } = fakeGetDb().docs.get(gamePath(game.id)) ?? {}

    fakeGetDb().docs.set(gamePath(game.id), rest)

    expect((await gamesRepository.getById(game.id))?.turnAudit).toEqual([])
  })
})
