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
import { turnsRepository } from '@/data/turns.repository'
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
