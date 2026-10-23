import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameDetailPage from '@/pages/GameDetailPage.vue'
import { gamesRepository } from '@/data/games.repository'
import type { GameRecord } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { turnsRepository } from '@/data/turns.repository'
import { toPlayerId } from '@/domain/types'
import type { PlayerId, Seat } from '@/domain/types'
import {
  doc,
  fakeAdvanceSeconds,
  fakeGetDb,
  fakeNow,
  fakeReset,
  writeBatch,
} from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'
import { useSessionStore } from '@/stores/session'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return {
    getDb: fakeGetDb,
    watchAuthState: vi.fn(() => () => undefined),
    signOutSession: vi.fn(() => Promise.resolve()),
  }
})
vi.mock('vue-router', async () => {
  const { vueRouterMock } = await import('@/test-utils/routerMock')

  return vueRouterMock
})

async function createPlayers(): Promise<PlayerRecord[]> {
  return Promise.all(
    ['p1', 'p2', 'p3', 'p4'].map((externalId) =>
      playersRepository.create({ externalId, name: externalId }),
    ),
  )
}

async function createGame(players: readonly PlayerRecord[]): Promise<GameRecord> {
  const [p1, p2, p3, p4] = players

  if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined) {
    throw new Error('faltan jugadores')
  }

  return gamesRepository.create({
    seasonId: null,
    date: { seconds: 1714521600, nanoseconds: 0 },
    gameLength: 'tonpuusen',
    ruleset: 'mahjongSouls',
    rulesetVersion: '1.0',
    startPoints: 25000,
    players: [
      { seat: 'east', playerId: p1.id },
      { seat: 'south', playerId: p2.id },
      { seat: 'west', playerId: p3.id },
      { seat: 'north', playerId: p4.id },
    ],
  })
}

interface TurnOptions {
  readonly riichiDeclaredBy?: readonly PlayerId[]
  readonly riichiSticks?: number
}

async function createTurns(
  game: GameRecord,
  count: number,
  options: TurnOptions = {},
): Promise<void> {
  const seats: readonly Seat[] = ['east', 'south', 'west', 'north']

  for (let index = 0; index < count; index += 1) {
    const turnNo = index + 1
    const seat = seats[index % seats.length] ?? 'east'
    const dealerId =
      game.players.find((player) => player.seat === seat)?.playerId ?? game.players[0]?.playerId

    if (dealerId === undefined) {
      throw new Error('faltan jugadores')
    }

    await turnsRepository.create(game.id, {
      turnNo,
      wind: 'east',
      dealerId,
      honba: 0,
      resultType: 'ryuukyoku',
      yaku: [],
      yakuHan: 0,
      doraCount: 0,
      fu: 20,
      tenpai: [],
      riichiDeclaredBy: turnNo === count ? (options.riichiDeclaredBy ?? []) : [],
      riichiSticks: turnNo === count ? (options.riichiSticks ?? 0) : 0,
      value: [],
      deltas: game.players.map((player) => ({ playerId: player.playerId, delta: 0 })),
      capturedBy: 'cap-1',
      isRenchan: false,
      isFinalTurn: false,
      discarderId: null,
      chomboId: null,
      yakuHanOverride: 0,
    })
  }
}

/**
 * `BaseDialog` teleporta a `document.body`, así que un diálogo abierto de un test anterior
 * seguiría en el cuerpo y sus botones se confundirían con los de este. Mismo aislamiento que
 * `BaseDialog.test.ts`: se desmonta al terminar y el cuerpo se limpia en el siguiente `beforeEach`.
 */
let mounted: VueWrapper | undefined

function mountPage(gameId: string): {
  wrapper: ReturnType<typeof mount>
  pinia: ReturnType<typeof createPinia>
} {
  const pinia = createPinia()
  const wrapper = mount(GameDetailPage, {
    props: { gameId },
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
  mounted = wrapper

  return { wrapper, pinia }
}

function authenticate(pinia: ReturnType<typeof createPinia>): void {
  const session = useSessionStore(pinia)
  session.status = 'authenticated'
  session.user = { id: 'cap-1', email: 'cap@correo.es', displayName: 'Cap', photoURL: null }
}

function findButtons(
  wrapper: ReturnType<typeof mount>,
  label: string,
): Array<{ trigger: (event: string) => Promise<void> }> {
  const wrapperButtons = wrapper.findAll('button')
  const bodyButtons = Array.from(document.body.querySelectorAll('button'))
  const buttons = [...wrapperButtons.map((b) => b.element), ...bodyButtons]

  return buttons
    .filter((button) => button.textContent?.includes(label) === true)
    .map((button) => ({
      trigger: async (event: string) => {
        button.dispatchEvent(new MouseEvent(event, { bubbles: true }))
        await Promise.resolve()
      },
    }))
}

async function clickButton(wrapper: ReturnType<typeof mount>, label: string): Promise<void> {
  const [button] = findButtons(wrapper, label)

  if (button === undefined) {
    throw new Error(`Botón «${label}» no encontrado`)
  }

  await button.trigger('click')
}

const DAY = 86400

describe('T86 · GameDetailPage', () => {
  beforeEach(() => {
    fakeReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('muestra marcador, turnos con su captor y las fichas de riichi en bote (RF-3.11, RF-14.4, RF-5.6)', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 2, { riichiDeclaredBy: [players[0]?.id as PlayerId], riichiSticks: 2 })
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('p1'))
    expect(wrapper.text()).toContain('Marcador')
    expect(wrapper.text()).toContain('cap-1')
    expect(wrapper.text()).toContain('Fichas de riichi en el bote')
  })

  it('advierte antes de continuar con una partida estancada (RF-10.5)', async () => {
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    const players = await createPlayers()
    const game = await createGame(players)
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('p1'))
    expect(wrapper.find('[data-test="stale-notice"]').exists()).toBe(false)

    fakeAdvanceSeconds(8 * DAY)
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    // `now()` del componente no es reactivo: hay que forzar el repintado al mover el reloj.
    wrapper.vm.$forceUpdate()
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Esta partida lleva más de 7 días sin actividad'),
    )
    expect(wrapper.find('[data-test="stale-notice"]').exists()).toBe(true)

    vi.useRealTimers()
  })

  it('confirma antes de finalizar (RF-9.1): el diálogo aparece y nada se fija hasta confirmar', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 4)
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Finalizar'))
    await clickButton(wrapper, 'Finalizar')

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('¿Finalizar la partida? El resultado quedará fijado.')
    expect(wrapper.text()).not.toContain('Finalizada')
  })

  it('finaliza tras confirmar y permite deshacer la finalización (RF-9.4)', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 4)
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Finalizar'))
    await clickButton(wrapper, 'Finalizar')
    await vi.waitFor(() => expect(document.body.textContent).toContain('Confirmar'))
    await clickButton(wrapper, 'Confirmar')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Finalizada'))

    await clickButton(wrapper, 'Deshacer finalización')
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('¿Deshacer la finalización?'),
    )
    await clickButton(wrapper, 'Confirmar')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Abierta'))
  })

  it('una partida abortada no ofrece finalizar (T86, RF-9.2)', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 1)

    const changes = writeBatch(fakeGetDb())
    changes.update(doc(fakeGetDb(), 'games', game.id), { status: 'aborted' })
    await changes.commit()

    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Abortada'))
    expect(wrapper.text()).not.toContain('Finalizar')
  })

  it('una partida inconclusa muestra su estado y no ofrece finalizar ni capturar (RF-0.1, RF-0.3)', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 1)

    const changes = writeBatch(fakeGetDb())
    changes.update(doc(fakeGetDb(), 'games', game.id), { status: 'unfinished' })
    await changes.commit()

    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Inconclusa'))
    expect(wrapper.text()).not.toContain('Finalizar')
    expect(wrapper.text()).not.toContain('Capturar turno')
  })

  it('con bancarrota solo permite finalizar (RF-10.6)', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 4)
    await gamesRepository.update(game.id, { mustFinalize: true })

    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Bancarrota'))
    expect(wrapper.text()).toContain('Finalizar')
    expect(wrapper.text()).not.toContain('Capturar turno')
  })
})

/**
 * T22 y T23 · RF-29.1 a RF-29.3. El club pidió por nombre la palabra «abortar» para el botón, y que
 * el resultado se describa siempre como **inconclusa**. El aviso anterior mentía: decía «abortada»
 * para una transición que devuelve `unfinished` (`domain/game.ts:107`), que se pinta como
 * «Inconclusa» (`es.ts:251`). «Abortar» y `aborted` dejan de ser sinónimos.
 */
describe('T22-T23 · abortar deja inconclusa', () => {
  beforeEach(() => {
    fakeReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('el botón dice «abortar» y ninguna pantalla dice «abandonar» para esa acción (RF-29.1)', async () => {
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    const players = await createPlayers()
    const game = await createGame(players)

    fakeAdvanceSeconds(8 * DAY)
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Abortar partida'))
    expect(wrapper.text()).not.toContain('Abandonar')

    vi.useRealTimers()
  })

  it('el aviso dice que queda inconclusa y no que queda abortada (RF-29.2, RF-29.3)', async () => {
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    const players = await createPlayers()
    const game = await createGame(players)

    fakeAdvanceSeconds(8 * DAY)
    vi.setSystemTime(new Date(fakeNow().seconds * 1000))
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Abortar partida'))
    await clickButton(wrapper, 'Abortar partida')

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent?.toLowerCase()).toContain('inconclusa')
    expect(dialog?.textContent?.toLowerCase()).not.toContain('abortada')

    vi.useRealTimers()
  })
})

/**
 * T39 · RF-23.3. El detalle enseña la ronda, la localía y el honba de la mano siguiente **sin
 * pedirlos a nadie**: los deriva `domain/replay.ts` y salen de la misma fuente que rellena el
 * formulario, así que no pueden discrepar.
 */
describe('T39 · el detalle muestra el estado derivado', () => {
  beforeEach(() => {
    fakeReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('sin turnos muestra el estado inicial de la partida', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    const { wrapper } = mountPage(game.id)

    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

    expect(wrapper.find('[data-test="next-wind"]').text()).toBe('Este')
    expect(wrapper.find('[data-test="next-dealer"]').text()).toBe('Este')
    expect(wrapper.find('[data-test="next-honba"]').text()).toBe('0')
  })

  it('con turnos muestra el estado que dejaría el último, no el del último', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 1)

    const { wrapper } = mountPage(game.id)

    // El primer turno es un empate sin tenpai: la localía avanza y el contador vuelve a cero.
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-honba"]').text()).toBe('0'))

    expect(wrapper.find('[data-test="next-dealer"]').text()).toBe('Sur')
  })

  it('no pide la ronda, la localía ni el honba en ninguna parte del detalle', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 2)

    const { wrapper } = mountPage(game.id)

    await vi.waitFor(() => expect(wrapper.find('[data-test="turn-timeline"]').exists()).toBe(true))

    expect(wrapper.find('select[name="dealerId"]').exists()).toBe(false)
    expect(wrapper.find('select[name="wind"]').exists()).toBe(false)
    expect(wrapper.find('input[name="honba"]').exists()).toBe(false)
  })
})

/**
 * RF-19.10, que la tabla de trazabilidad asigna a T39. Una corrección que no se ve es una corrección
 * que no ha pasado: quien lee el turno tiene que ver quién lo corrigió, cuándo y qué cambió, venga
 * el registro del turno o el de la partida.
 */
describe('T39 · quién corrigió cada turno (RF-19.10)', () => {
  beforeEach(() => {
    fakeReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('un turno sin correcciones lo dice, y no enseña un registro vacío', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 1)

    const { wrapper } = mountPage(game.id)

    await vi.waitFor(() => expect(wrapper.text()).toContain('cap-1'))
    expect(wrapper.findAll('[data-test="turn-audit"]')).toHaveLength(0)
    expect(wrapper.find('[data-test="turn-timeline"]').text()).toContain('cap-1')
  })

  it('un turno corregido muestra quién, cuándo y qué cambió', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 1)
    fakeAdvanceSeconds(3600)

    await turnsRepository.update(game.id, 1, { fu: 30 }, { by: 'cap-2', expectedAuditCount: 0 })
    fakeAdvanceSeconds(60)

    // El segundo cambio lo hizo el sistema, y el registro tiene que distinguirlo (RF-19.5).
    await turnsRepository.update(
      game.id,
      1,
      { honba: 1 },
      { by: 'cap-3', expectedAuditCount: 1, derived: ['honba'] },
    )

    const { wrapper } = mountPage(game.id)

    await vi.waitFor(() => expect(wrapper.findAll('[data-test="turn-audit"] li').length).toBe(2))

    const audit = wrapper.find('[data-test="turn-audit"]').text()

    expect(audit).toContain('cap-2')
    expect(audit).toContain('cap-3')
    expect(audit).toContain('Fu')
    expect(audit).toContain('cambiado a mano')
    expect(audit).toContain('calculado por el sistema')
  })

  it('el borrado de un turno sin anterior se lee en el registro de la partida', async () => {
    const players = await createPlayers()
    const game = await createGame(players)
    await createTurns(game, 2)
    fakeAdvanceSeconds(3600)

    await turnsRepository.remove(game.id, 1)
    await gamesRepository.update(game.id, {
      turnAudit: [
        {
          at: fakeNow(),
          by: 'cap-2',
          action: 'delete',
          turnNo: 1,
          before: {
            turnNo: 1,
            wind: 'east',
            dealerId: game.players[0]?.playerId ?? toPlayerId('p1'),
            honba: 0,
            resultType: 'ryuukyoku',
            yaku: [],
            yakuHan: 0,
            yakuHanOverride: 0,
            doraCount: 0,
            fu: 20,
            tenpai: [],
            riichiDeclaredBy: [],
            riichiSticks: 0,
            value: [],
            deltas: [],
            discarderId: null,
            chomboId: null,
            capturedBy: 'cap-1',
            isRenchan: false,
            isFinalTurn: false,
          },
        },
      ],
    })

    const { wrapper } = mountPage(game.id)

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="game-turn-audit"]').exists()).toBe(true),
    )

    const audit = wrapper.find('[data-test="game-turn-audit"]')

    expect(audit.text()).toContain('cap-2')
    expect(audit.text()).toContain('1')
  })
})

/**
 * RF-33.1 a RF-33.7. La capacidad de borrar ya existe (`useGameTurns.ts`); lo que faltaba era la
 * pantalla: ofrecer el borrado **solo** del último turno, pedir confirmación, levantar la marca de
 * bancarrota cuando tocaría y explicar el desajuste.
 */
describe('borrar el último turno', () => {
  beforeEach(() => {
    fakeReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  /** Un turno de empate con el reparto de puntos que se le pida. */
  async function addTurn(
    game: GameRecord,
    turnNo: number,
    deltas: readonly number[],
  ): Promise<void> {
    const dealerId = game.players[0]?.playerId

    if (dealerId === undefined) {
      throw new Error('faltan jugadores')
    }

    await turnsRepository.create(game.id, {
      turnNo,
      wind: 'east',
      dealerId,
      honba: 0,
      resultType: 'ryuukyoku',
      yaku: [],
      yakuHan: 0,
      doraCount: 0,
      fu: 20,
      tenpai: [],
      riichiDeclaredBy: [],
      riichiSticks: 0,
      value: [],
      deltas: game.players.map((player, index) => ({
        playerId: player.playerId,
        delta: deltas[index] ?? 0,
      })),
      capturedBy: 'cap-1',
      isRenchan: false,
      isFinalTurn: false,
      discarderId: null,
      chomboId: null,
      yakuHanOverride: 0,
    })
  }

  async function gameWithTurns(
    turns: readonly (readonly number[])[],
  ): Promise<{ game: GameRecord; p1: PlayerId }> {
    const players = await createPlayers()
    const game = await createGame(players)
    const p1 = players[0]?.id as PlayerId

    for (const [index, deltas] of turns.entries()) {
      await addTurn(game, index + 1, deltas)
    }

    return { game, p1 }
  }

  /** Pulsa el botón de confirmación del diálogo de borrado, que vive en el cuerpo. */
  async function confirmDelete(): Promise<void> {
    const button = document.body.querySelector('[data-test="delete-turn-confirm"]')

    if (button === null) {
      throw new Error('Botón de confirmar el borrado no encontrado')
    }

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  }

  it('ofrece borrar solo el último turno y pide confirmación antes de hacerlo', async () => {
    const { game } = await gameWithTurns([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.find('[data-test="delete-turn-2"]').exists()).toBe(true))

    // Un turno que no es el último no se puede borrar desde aquí (RF-33.3).
    expect(wrapper.find('[data-test="delete-turn-1"]').exists()).toBe(false)

    await wrapper.find('[data-test="delete-turn-2"]').trigger('click')

    const dialog = document.body.querySelector('[role="dialog"]')

    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('turno 2')
    // Hasta que se confirma, no se borra nada (RF-33.1).
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])
  })

  it('el borrado usa la capacidad que ya existe y deja el turno fuera (RF-33.2)', async () => {
    const { game } = await gameWithTurns([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.find('[data-test="delete-turn-2"]').exists()).toBe(true))
    await wrapper.find('[data-test="delete-turn-2"]').trigger('click')
    await confirmDelete()

    await vi.waitFor(async () =>
      expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1]),
    )
    await vi.waitFor(() => expect(wrapper.find('[data-test="delete-turn-2"]').exists()).toBe(false))
  })

  it('borrar el turno que dejaba la partida en bancarrota levanta la marca (RF-33.4)', async () => {
    const { game } = await gameWithTurns([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    await gamesRepository.update(game.id, { mustFinalize: true })

    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.find('[data-test="delete-turn-2"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('Bancarrota')

    await wrapper.find('[data-test="delete-turn-2"]').trigger('click')
    await confirmDelete()

    await vi.waitFor(async () =>
      expect((await gamesRepository.getById(game.id))?.mustFinalize).toBe(false),
    )
    // La pantalla refleja la marca levantada (RF-33.4).
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Bancarrota'))
  })

  it('un recuento desfasado se rechaza y la pantalla lo explica (RF-33.6)', async () => {
    const { game } = await gameWithTurns([[0, 0, 0, 0]])
    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() => expect(wrapper.find('[data-test="delete-turn-1"]').exists()).toBe(true))

    // Otro sitio captura un turno mientras esta pantalla sigue abierta.
    await addTurn(game, 2, [0, 0, 0, 0])

    await wrapper.find('[data-test="delete-turn-1"]').trigger('click')
    await confirmDelete()

    await vi.waitFor(() =>
      expect(document.body.querySelector('[data-test="delete-turn-error"]')).not.toBeNull(),
    )
    expect(document.body.querySelector('[data-test="delete-turn-error"]')?.textContent).toContain(
      'cambió en otro sitio',
    )
    // No se borra nada: el estado local estaba desfasado (RF-33.6).
    expect((await turnsRepository.list(game.id)).map((turn) => turn.turnNo)).toStrictEqual([1, 2])
  })

  it('tras borrar, la partida queda lista para capturar ese mismo número (RF-33.5, RF-33.7)', async () => {
    const { game, p1 } = await gameWithTurns([
      [1000, -1000, 0, 0],
      [2000, -2000, 0, 0],
    ])
    const season = await seasonsRepository.create({
      title: 'Temporada',
      dateFrom: { seconds: 1714521600, nanoseconds: 0 },
      dateTo: { seconds: 1714608000, nanoseconds: 0 },
    })
    await gamesRepository.update(game.id, { seasonId: season.id })

    const { wrapper, pinia } = mountPage(game.id)
    authenticate(pinia)

    await vi.waitFor(() =>
      expect(wrapper.find(`[data-test="standing-${p1}"]`).text()).toContain('28000'),
    )

    await wrapper.find('[data-test="delete-turn-2"]').trigger('click')
    await confirmDelete()

    await vi.waitFor(() =>
      expect(wrapper.find(`[data-test="standing-${p1}"]`).text()).toContain('26000'),
    )
    // El número del turno borrado queda libre: la numeración no tiene huecos (RF-33.5).
    expect(await turnsRepository.nextNumber(game.id)).toBe(2)
    // Y la captura sigue disponible (RF-33.5).
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    // Los agregados de temporada no cuentan el turno borrado (RF-33.7): una partida abierta no
    // entra en ellos, así que su turno borrado tampoco puede contarse.
    expect(await playerSeasonStatsRepository.listBySeason(season.id)).toHaveLength(0)
  })
})
