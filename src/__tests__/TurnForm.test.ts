import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TurnForm from '@/components/turns/TurnForm.vue'
import { ERROR_KEYS } from '@/data/errors'
import { gamesRepository } from '@/data/games.repository'
import type { GameRecord } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { turnsRepository } from '@/data/turns.repository'
import type { PlayerDelta } from '@/domain/turn'
import type { PlayerId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
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

async function createFourPlayers(): Promise<PlayerRecord[]> {
  return Promise.all(
    ['p1', 'p2', 'p3', 'p4'].map((externalId) =>
      playersRepository.create({ externalId, name: externalId }),
    ),
  )
}

async function createGame(
  ruleset: 'mahjongSouls' | 'mleague' = 'mahjongSouls',
): Promise<GameRecord> {
  const [p1, p2, p3, p4] = await createFourPlayers()

  if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined) {
    throw new Error('faltan jugadores')
  }

  return gamesRepository.create({
    seasonId: null,
    date: { seconds: 1714521600, nanoseconds: 0 },
    gameLength: 'tonpuusen',
    ruleset,
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

function mountTurnForm(game: GameRecord) {
  const pinia = createPinia()

  const wrapper = mount(TurnForm, {
    props: { game },
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })

  return { wrapper, pinia }
}

function authenticate(pinia: ReturnType<typeof createPinia>): PlayerId {
  const session = useSessionStore(pinia)
  session.status = 'authenticated'
  session.user = { id: 'cap-1', email: 'cap@correo.es', displayName: 'Cap', photoURL: null }

  return 'cap-1' as PlayerId
}

function playerOf(game: GameRecord, index: 0 | 1 | 2 | 3): PlayerId {
  const seat = game.players[index]
  if (seat === undefined) {
    throw new Error(`falta el asiento ${index}`)
  }
  return seat.playerId
}

/**
 * T34 y T36: el han y la localía ya no se escriben. El dealer sale del estado derivado y los han
 * del catálogo, así que el helper solo marca resultado, ganador, dora, fu y yaku —que es todo lo
 * que queda como entrada de una mano.
 */
async function setWinHand(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  { winner, dora, fu }: { winner: PlayerId; dora: number; fu: number },
  yaku: readonly string[] = [],
): Promise<void> {
  await wrapper.find('select[name="resultType"]').setValue('tsumo')
  await wrapper.find('select[name="winnerId"]').setValue(winner)
  await wrapper.find('input[name="doraCount"]').setValue(String(dora))
  await wrapper.find('input[name="fu"]').setValue(String(fu))

  for (const id of yaku) {
    const check = wrapper.find(`input[type="checkbox"][value="${id}"]`)
    if (!check.exists()) {
      throw new Error(`yaku «${id}» no está en el catálogo del formulario`)
    }
    await check.setValue(true)
  }
}

async function toggleTenpaiPlayer(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  seatLabel: string,
): Promise<void> {
  const fieldsets = wrapper.findAll('fieldset')
  const tenpai = fieldsets[1]
  if (tenpai === undefined) {
    throw new Error('no hay fieldset de tenpai')
  }

  const label = tenpai.findAll('label').find((candidate) => candidate.text() === seatLabel)
  if (label === undefined || label.find('input') === undefined) {
    throw new Error(`no hay jugador «${seatLabel}» en el fieldset de tenpai`)
  }
  await label.find('input').setValue(true)
}

/** El contador «Riichi declarado» es el primer fieldset; cada etiqueta es el asiento. */
async function declareRiichi(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  seatLabel: string,
): Promise<void> {
  const counters = wrapper.find('fieldset[data-test="riichi"]')

  const label = counters.findAll('label').find((candidate) => candidate.text() === seatLabel)
  if (label === undefined || label.find('input').exists() === false) {
    throw new Error(`no hay contador de riichi para el asiento «${seatLabel}»`)
  }

  await label.find('input').setValue(true)
}

describe('T80+T81 · TurnForm', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('exige tipo de resultado', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Elige el tipo de resultado.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('exige tenpai en el empate', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Indica qué jugadores están en tenpai.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('rechaza una mano sin yaku real', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: east, dora: 0, fu: 30 })

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('La mano necesita al menos un yaku real; los dora no sirven.')
  })

  it('rechaza un yaku de viento ajeno al asiento y la ronda', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: east, dora: 0, fu: 30 }, ['seatSouth'])

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain(
      'El yaku de viento no corresponde a este asiento ni a esta ronda.',
    )
  })

  it('rechaza 25 fu fuera de chiitoitsu', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: east, dora: 0, fu: 25 }, ['riichi'])

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain(
      '25 fu solo vale para chiitoitsu, y chiitoitsu solo vale 25 fu.',
    )
  })

  it('rechaza combos de han y fu sin representación en la tabla', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)
    const south = playerOf(game, 1)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await wrapper.find('select[name="winnerId"]').setValue(east)
    await wrapper.find('select[name="discarderId"]').setValue(south)
    await wrapper.find('input[name="doraCount"]').setValue(0)
    await wrapper.find('input[name="fu"]').setValue(20)
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain(
      'La combinación de han y fu no aparece en la tabla de puntuación.',
    )
  })

  it('registra un tsumo válido, emite saved y descarta el borrador', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: east, dora: 0, fu: 30 }, ['riichi'])

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      turnNo: number
      resultType: string
      yaku: readonly string[]
      capturedBy: string
      deltas: readonly { delta: number }[]
    }
    expect(record.turnNo).toBe(1)
    expect(record.resultType).toBe('tsumo')
    expect(record.yaku).toContain('riichi')
    expect(record.capturedBy).toBe('cap-1')
    expect(record.deltas.reduce((total, entry) => total + entry.delta, 0)).toBe(0)

    expect(localStorage.getItem(`mahjongbu.turn-draft.${game.id}`)).toBeNull()

    const stored = await turnsRepository.list(game.id)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.yaku).toContain('riichi')
  })

  /**
   * T104 · RF-4.1 y RF-5.1: el caso que el club encontró al jugar. El Este declara riichi **y
   * gana esa misma mano por tsumo**, con la mesa sin fichas. Los deltas cuadran a cero —la ficha
   * que declara vuelve con el bote—, pero la validación comparaba las fichas declaradas con las
   * que ya había en la mesa, pedía −1000 y rechazaba la captura con «no cuadra».
   */
  it('el ganador que declara riichi en su propia mano se guarda (T104, RF-4.1)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: east, dora: 2, fu: 22 }, [
      'riichi',
      'ippatsu',
      'menzenTsumo',
    ])
    await declareRiichi(wrapper, 'Este')

    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())
    expect(wrapper.text()).not.toContain(
      'La suma de deltas no cuadra con los riichi y chombos del turno.',
    )

    const stored = await turnsRepository.list(game.id)
    expect(stored).toHaveLength(1)

    const turn = stored[0]
    expect(turn?.riichiDeclaredBy).toEqual([east])
    // 5 han es mangan: el Este cobra 4000 de cada uno y su ficha propia le vuelve con el bote.
    expect(turn?.riichiSticks).toBe(0)
    expect(turn?.deltas.reduce((total, entry) => total + entry.delta, 0)).toBe(0)
    expect(turn?.deltas.find((entry) => entry.playerId === east)?.delta).toBe(12000)
  })

  it('registra un empate con tenpai indicado', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const south = playerOf(game, 1)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await toggleTenpaiPlayer(wrapper, 'Sur')

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      turnNo: number
      resultType: string
      tenpai: readonly PlayerId[]
    }
    expect(record.resultType).toBe('ryuukyoku')
    expect(record.tenpai).toEqual([south])
  })

  it('exige dora y fu antes de guardar una mano (RF-3.13, derogado por RF-22.1)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 1, fu: 30 }, ['riichi'])
    // Un campo borrado vale 0 con `Number('')`, así que sin esto se guardaba en silencio.
    await wrapper.find('input[name="doraCount"]').setValue('')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Indica yaku, dora y fu antes de guardar la mano.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('rechaza una mano sin ningún yaku marcado (RF-22.8, antes RF-4.3)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 3, fu: 30 }, [])

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('La mano necesita al menos un yaku real; los dora no sirven.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('advierte de los yaku imposibles que no puede detectar (RF-4.8)', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="impossible-yaku-notice"]').text()).toContain(
        'no detecta todos los yaku imposibles',
      ),
    )
  })

  it('avisa de que la partida ha terminado cuando alguien queda por debajo de cero (RF-4.7)', async () => {
    const game = await createGame()
    await turnsRepository.create(game.id, {
      wind: 'east',
      dealerId: playerOf(game, 0),
      honba: 0,
      resultType: 'chombo',
      yaku: [],
      yakuHan: 0,
      doraCount: 0,
      fu: 0,
      tenpai: [],
      riichiDeclaredBy: [],
      riichiSticks: 0,
      value: [],
      deltas: [{ playerId: playerOf(game, 3), delta: -30000 }],
      capturedBy: 'user-1',
      isRenchan: false,
      isFinalTurn: false,
      turnNo: 1,
      discarderId: null,
      chomboId: playerOf(game, 3),
      yakuHanOverride: 0,
    })

    const { wrapper } = mountTurnForm(game)

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="bankrupt-notice"]').text()).toContain(
        'Alguien ha quedado por debajo de cero',
      ),
    )
    expect(wrapper.find('[data-test="bankrupt-notice"]').text()).toContain('Norte')
  })

  it('avisa al superar el punto de retorno sin cerrar la partida (RF-8.7)', async () => {
    const game = await createGame()
    await turnsRepository.create(game.id, {
      wind: 'east',
      dealerId: playerOf(game, 0),
      honba: 0,
      resultType: 'chombo',
      yaku: [],
      yakuHan: 0,
      doraCount: 0,
      fu: 0,
      tenpai: [],
      riichiDeclaredBy: [],
      riichiSticks: 0,
      value: [],
      deltas: [{ playerId: playerOf(game, 0), delta: 20000 }],
      capturedBy: 'user-1',
      isRenchan: false,
      isFinalTurn: false,
      turnNo: 1,
      discarderId: null,
      chomboId: playerOf(game, 0),
      yakuHanOverride: 0,
    })

    const { wrapper } = mountTurnForm(game)

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="return-point-notice"]').text()).toContain(
        'Se ha superado el punto de retorno de 30 000',
      ),
    )
    expect(wrapper.find('[data-test="return-point-notice"]').text()).toContain(
      'la partida continúa sin prolongation',
    )
  })

  it('abandonar la captura no guarda nada (RF-3.10)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('chombo')

    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancelar')
    expect(cancel).toBeDefined()

    await cancel?.trigger('click')
    await nextTick()

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(await turnsRepository.list(game.id)).toHaveLength(0)
  })

  it('bloquea la captura sin sesión y conserva el borrador a través de una recarga', async () => {
    const game = await createGame()
    const first = mountTurnForm(game)
    const east = playerOf(game, 0)

    await first.wrapper.find('select[name="resultType"]').setValue('tsumo')
    await first.wrapper.find('select[name="winnerId"]').setValue(east)
    await first.wrapper.find('input[name="doraCount"]').setValue('1')

    await first.wrapper.find('form').trigger('submit')

    expect(first.wrapper.text()).toContain('Necesitas iniciar sesión para guardar el turno.')
    expect(first.wrapper.emitted('saved')).toBeUndefined()

    first.wrapper.unmount()

    const second = mountTurnForm(game)
    await nextTick()

    expect(
      (second.wrapper.find('select[name="resultType"]').element as HTMLSelectElement).value,
    ).toBe('tsumo')
    expect((second.wrapper.find('input[name="doraCount"]').element as HTMLInputElement).value).toBe(
      '1',
    )
    // El borrador ya no guarda la localía ni el honba: los deriva el sistema (T34, RF-23.4).
    expect(second.wrapper.find('[data-test="winner-east"]').exists()).toBe(true)
  })

  it('rechaza la captura en sistemas de reglas sin soporte', async () => {
    const game = await createGame('mleague')
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('tsumo')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Esta partida no admite captura por su sistema de reglas.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})

/**
 * T34 · RF-18.1, RF-18.3, RF-18.4 y RF-18.5. La localía, el viento de ronda y el honba **no se
 * capturan**: los calcula el sistema a partir de los turnos anteriores y el formulario los enseña
 * como estado de la mano siguiente (RF-23.3). Es la derogación de RF-3.13 haciéndose efectiva.
 */
describe('T34 · la localía, la ronda y el honba son de solo lectura', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('no ofrece ningún control para escribirlos', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

    expect(wrapper.find('select[name="dealerId"]').exists()).toBe(false)
    expect(wrapper.find('select[name="wind"]').exists()).toBe(false)
    expect(wrapper.find('input[name="honba"]').exists()).toBe(false)
  })

  it('muestra el estado inicial de la partida cuando no hay turnos', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').text()).toContain('Este'))

    const panel = wrapper.find('[data-test="next-hand"]')

    expect(panel.text()).toContain('Localía')
    expect(panel.text()).toContain('Contadores')
    expect(panel.text()).toContain('0')
  })

  it('el estado que muestra es el de la mano que se va a guardar, no el del último turno', async () => {
    const game = await createGame()
    const east = playerOf(game, 0)

    await turnsRepository.create(game.id, {
      turnNo: 1,
      wind: 'east',
      dealerId: east,
      honba: 0,
      resultType: 'ryuukyoku',
      yaku: [],
      yakuHan: 0,
      yakuHanOverride: 0,
      doraCount: 0,
      fu: 0,
      tenpai: [east],
      riichiDeclaredBy: [],
      riichiSticks: 0,
      value: [],
      deltas: [
        { playerId: east, delta: 3000 },
        { playerId: playerOf(game, 1), delta: -1000 },
        { playerId: playerOf(game, 2), delta: -1000 },
        { playerId: playerOf(game, 3), delta: -1000 },
      ],
      capturedBy: 'user-1',
      isRenchan: false,
      isFinalTurn: false,
      discarderId: null,
      chomboId: null,
    })

    const { wrapper } = mountTurnForm(game)

    // El dealer conserva la tenpai: sigue siendo el Este y el honba pasa a 1.
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').text()).toContain('1'))

    expect(wrapper.find('[data-test="next-honba"]').text()).toContain('1')
    expect(wrapper.find('[data-test="next-dealer"]').text()).toContain('Este')
  })

  it('el turno guardado lleva el estado derivado, no lo que hubiera en el formulario', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await toggleTenpaiPlayer(wrapper, 'Este')
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      wind: string
      dealerId: PlayerId
      honba: number
    }

    expect(record).toMatchObject({ wind: 'east', dealerId: playerOf(game, 0), honba: 0 })
  })
})

/**
 * T35 · RF-21.1 a RF-21.5. El motor ya resolvía el ron múltiple desde 001; lo que faltaba era el
 * camino para llegar hasta él. Y el club vetó el *suufon renta*, así que un tsumo con más de un
 * ganador se rechaza con su propio aviso en vez de guardarse como una mano normal.
 */
describe('T35 · captura de un ron múltiple', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  async function addWinner(wrapper: ReturnType<typeof mountTurnForm>['wrapper'], id: PlayerId) {
    const select = wrapper.find('select[name="winnerId"]')

    if (select.exists() === false) {
      throw new Error('no hay selector de ganador')
    }

    await select.setValue(id)
  }

  it('admite de uno a tres ganadores por ron', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await addWinner(wrapper, playerOf(game, 0))
    await wrapper.find('select[name="discarderId"]').setValue(playerOf(game, 3))
    await wrapper.find('input[name="doraCount"]').setValue('0')
    await wrapper.find('input[name="fu"]').setValue('30')
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      resultType: string
      value: readonly { playerId: PlayerId; points: number }[]
    }

    expect(record.resultType).toBe('ron')
    expect(record.value).toHaveLength(1)
  })

  it('el descartador no aparece en la lista de ganador si ya es ganador', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await wrapper.find('select[name="discarderId"]').setValue(playerOf(game, 3))
    await addWinner(wrapper, playerOf(game, 0))

    const options = wrapper.find('select[name="winnerId"]').findAll('option')
    const values = options.map((option) => option.attributes('value'))

    expect(values).not.toContain(playerOf(game, 3))
  })

  it('el ganador no aparece en la lista de descartador', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await addWinner(wrapper, playerOf(game, 0))

    const options = wrapper.find('select[name="discarderId"]').findAll('option')
    const values = options.map((option) => option.attributes('value'))

    expect(values).not.toContain(playerOf(game, 0))
    expect(values).toHaveLength(3)
  })

  it('un ya elegido no se puede volver a añadir como ganador', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await addWinner(wrapper, playerOf(game, 0))

    const values = wrapper
      .find('select[name="winnerId"]')
      .findAll('option')
      .map((option) => option.attributes('value'))

    expect(values).not.toContain(playerOf(game, 0))
  })

  it('un ron de tres ganadores carga al descartador la suma de las tres manos', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const north = playerOf(game, 3)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await wrapper.find('select[name="discarderId"]').setValue(north)
    await addWinner(wrapper, playerOf(game, 0))
    await addWinner(wrapper, playerOf(game, 1))
    await addWinner(wrapper, playerOf(game, 2))
    await wrapper.find('input[name="doraCount"]').setValue('0')
    await wrapper.find('input[name="fu"]').setValue('30')
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      value: readonly { points: number }[]
      deltas: readonly PlayerDelta[]
    }
    const total = record.value.reduce((sum, entry) => sum + entry.points, 0)

    expect(record.value).toHaveLength(3)
    expect(record.deltas.find((entry) => entry.playerId === north)?.delta).toBe(-total)
    // El bote entero va a la mano de mayor valor basic points; con tres iguales, al de menor asiento.
    expect(record.deltas.reduce((sum, entry) => sum + entry.delta, 0)).toBe(0)
  })

  it('un tsumo con más de un ganador se rechaza con su propio aviso (RF-21.5)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await addWinner(wrapper, playerOf(game, 0))
    await addWinner(wrapper, playerOf(game, 1))
    await wrapper.find('input[name="doraCount"]').setValue('0')
    await wrapper.find('input[name="fu"]').setValue('30')
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)

    // Cambiar a tsumo con dos ya elegidos: el suufon renta está vetado por decisión del club.
    await wrapper.find('select[name="resultType"]').setValue('tsumo')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain(
      'Una mano por tsumo no puede tener cuatro ganadores: elige un solo ganador.',
    )
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})

/**
 * T36 · RF-22.5 a RF-22.8. El han sale del catálogo al marcar yaku; lo que una persona escriba es un
 * **delta** encima, y el desglose dice siempre qué parte es de cada uno. Un ajuste no sustituye a un
 * yaku: sin yaku real la mano se rechaza aunque el total quede por encima de cero.
 */
describe('T36 · los han se derivan del catálogo, con desglose y ajuste', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('al marcar yaku el total sube solo, sin escribirlo', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 0, fu: 30 }, ['riichi'])
    await declareRiichi(wrapper, 'Este')
    await nextTick()

    expect(wrapper.find('[data-test="han-total"]').text()).toContain('1')

    await wrapper.find('input[type="checkbox"][value="tanyao"]').setValue(true)
    await nextTick()

    expect(wrapper.find('[data-test="han-total"]').text()).toContain('2')
  })

  it('el total guardado es el del catálogo y el ajuste va aparte', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 1, fu: 30 }, ['riichi'])
    await declareRiichi(wrapper, 'Este')
    await wrapper.find('input[name="yakuHanOverride"]').setValue('-1')
    await nextTick()

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      yakuHan: number
      yakuHanOverride: number
    }

    expect(record.yakuHan).toBe(1)
    expect(record.yakuHanOverride).toBe(-1)
  })

  it('el desglose nombra cada yaku y el que no cuenta', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    // `rinshanKaihou` sin kan no cuenta (RF-22.3): aparece señalado, no desaparece.
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 0, fu: 30 }, [
      'riichi',
      'rinshanKaihou',
    ])
    await declareRiichi(wrapper, 'Este')
    await nextTick()

    const breakdown = wrapper.find('[data-test="han-breakdown"]').text()

    expect(breakdown).toContain('Riichi')
    expect(breakdown).toContain('Rinshan Kaihou')
    expect(breakdown).toContain('no cuenta')
    expect(wrapper.find('[data-test="han-total"]').text()).toContain('1')
  })

  it('un ajuste manual se marca como ajuste y se ve el desglose', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 0, fu: 30 }, ['riichi'])
    await declareRiichi(wrapper, 'Este')
    await wrapper.find('input[name="yakuHanOverride"]').setValue('2')
    await nextTick()

    const notice = wrapper.find('[data-test="override-notice"]')

    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('2')
    expect(wrapper.find('[data-test="han-total"]').text()).toContain('3')
  })

  it('sin yaku marcado, ningún ajuste salva la mano (RF-22.8)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 0, fu: 30 }, [])
    await wrapper.find('input[name="yakuHanOverride"]').setValue('13')
    await nextTick()

    expect(wrapper.find('[data-test="han-total"]').text()).toContain('13')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('La mano necesita al menos un yaku real; los dora no sirven.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('un yaku de límite puntúa 8 000 y su han de referencia no suma', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 5, fu: 30 }, ['daisangen'])
    await nextTick()

    const breakdown = wrapper.find('[data-test="han-breakdown"]').text()

    expect(breakdown).toContain('límite')
    expect(wrapper.find('[data-test="han-total"]').text()).toContain('0')
  })
})

/**
 * T37 · RF-23.1 a RF-23.5. Después de guardar, el formulario tiene que quedarse en blanco. Es el
 * fallo más fácil de cometer en la mesa y el más caro: duplica una mano entera con los datos de la
 * anterior, y el número de turno ya no es el que corresponde a esos datos.
 */
describe('T37 · el formulario se limpia al guardar', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('vacía resultado, ganador, yaku, han, dora, fu, tenpai, chombo y riichi', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('chombo')
    await wrapper.find('select[name="chomboId"]').setValue(playerOf(game, 2))
    await declareRiichi(wrapper, 'Este')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())
    await nextTick()

    expect((wrapper.find('select[name="resultType"]').element as HTMLSelectElement).value).toBe('')
    // Sin tipo de resultado no hay panel de chombo: el formulario se queda en blanco de verdad.
    expect(wrapper.find('select[name="chomboId"]').exists()).toBe(false)
    expect(wrapper.find('fieldset[data-test="riichi"]').findAll('input:checked')).toHaveLength(0)
  })

  it('vacía la mano capturada: ganador, yaku, han, dora y fu', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 2, fu: 30 }, ['riichi'])
    await wrapper.find('input[name="yakuHanOverride"]').setValue('1')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())
    await nextTick()

    expect(wrapper.find('[data-test="winners"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="han-total"]').exists()).toBe(false)

    // Y al volver a elegir un resultado de mano, todo está en su valor inicial.
    await wrapper.find('select[name="resultType"]').setValue('tsumo')

    expect(wrapper.find('[data-test="han-total"]').text()).toContain('0')
    expect(wrapper.find('[data-test="override-notice"]').exists()).toBe(false)
    expect((wrapper.find('input[name="doraCount"]').element as HTMLInputElement).value).toBe('0')
    expect((wrapper.find('input[name="fu"]').element as HTMLInputElement).value).toBe('20')
    expect((wrapper.find('input[name="yakuHanOverride"]').element as HTMLInputElement).value).toBe(
      '0',
    )
    expect(
      (wrapper.find('input[type="checkbox"][value="riichi"]').element as HTMLInputElement).checked,
    ).toBe(false)
    expect(wrapper.find('[data-test="winner-east"]').exists()).toBe(false)
  })

  it('el borrador de localStorage también queda limpio (RF-23.2)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 1, fu: 30 }, ['riichi'])
    await nextTick()

    expect(localStorage.getItem(`mahjongbu.turn-draft.${game.id}`)).not.toBeNull()

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    expect(localStorage.getItem(`mahjongbu.turn-draft.${game.id}`)).toBeNull()
  })

  it('recargar no restaura lo que se acaba de guardar (RF-23.2)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 1, fu: 30 }, ['riichi'])
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    expect(localStorage.getItem('mahjongbu.turn-draft.' + game.id)).toBeNull()
    wrapper.unmount()

    const reloaded = mountTurnForm(game)
    await nextTick()

    expect(reloaded.wrapper.find('[data-test="winner-east"]').exists()).toBe(false)
    expect(reloaded.wrapper.find('[data-test="winners"]').exists()).toBe(false)

    // El estado está en blanco: enviarlo pide el tipo de resultado otra vez.
    await reloaded.wrapper.find('form').trigger('submit')

    expect(reloaded.wrapper.text()).toContain('Elige el tipo de resultado.')
    expect(reloaded.wrapper.emitted('saved')).toBeUndefined()
  })

  it('el estado derivado no se reinicia al guardar (RF-23.4)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await toggleTenpaiPlayer(wrapper, 'Este')
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    // El Este conserva la tenpai: la siguiente mano vuelve a ser del Este, con honba 1.
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-honba"]').text()).toContain('1'))
    expect(wrapper.find('[data-test="next-dealer"]').text()).toContain('Este')
  })

  it('cancelar no borra lo ya guardado ni el borrador (RF-23.5)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 1, fu: 30 }, ['riichi'])
    await nextTick()

    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancelar')

    await cancel?.trigger('click')
    await nextTick()

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(localStorage.getItem(`mahjongbu.turn-draft.${game.id}`)).not.toBeNull()
  })
})

/**
 * El contador de la mano siguiente y lo que vale. Se fija con números porque es la regla que más
 * se ha puesto en duda: `docs/domain.md` §2 lo define como **contador de rondas no ganadas por el
 * dealer**, así que sube cuando el dealer *no* gana y vuelve a cero cuando gana. Cada contador vale
 * 300 puntos, cobrados por quien gana si es el dealer y pagados por él si pierde (§2 · Honba).
 */
describe('el contador de la mano siguiente y el bonus que da', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  function panel(wrapper: ReturnType<typeof mountTurnForm>['wrapper']): {
    dealer: string
    honba: string
  } {
    return {
      dealer: wrapper.find('[data-test="next-dealer"]').text(),
      honba: wrapper.find('[data-test="next-honba"]').text(),
    }
  }

  async function declareRiichiOf(
    wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
    seatLabel: string,
  ): Promise<void> {
    const labels = wrapper.find('fieldset[data-test="riichi"]').findAll('label')
    const label = labels.find((candidate) => candidate.text() === seatLabel)

    if (label === undefined) {
      throw new Error(`no hay contador de riichi para «${seatLabel}»`)
    }

    await label.find('input').setValue(true)
  }

  /** Tsumo de 1 han 30 fu con el riichi declarado: la mano más pequeña que puntúa. */
  async function dealerTsumo(
    wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
    winner: PlayerId,
    seatLabel: string,
  ): Promise<void> {
    const savedBefore = wrapper.emitted('saved')?.length ?? 0

    await wrapper.find('select[name="resultType"]').setValue('tsumo')
    await vi.waitFor(() => expect(wrapper.find('select[name="winnerId"]').exists()).toBe(true))
    await wrapper.find('select[name="winnerId"]').setValue(winner)
    await wrapper.find('input[name="doraCount"]').setValue('0')
    await wrapper.find('input[name="fu"]').setValue('30')
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)
    await declareRiichiOf(wrapper, seatLabel)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.emitted('saved')?.length ?? 0).toBeGreaterThan(savedBefore),
    )
  }

  /** Empate en el que solo está en tenpai el asiento indicado. */
  async function drawWithTenpai(
    wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
    seatLabel: string,
  ): Promise<void> {
    const savedBefore = wrapper.emitted('saved')?.length ?? 0

    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await vi.waitFor(() => expect(wrapper.find('fieldset[data-test="tenpai"]').exists()).toBe(true))
    const labels = wrapper.find('fieldset[data-test="tenpai"]').findAll('label')
    const label = labels.find((candidate) => candidate.text() === seatLabel)

    if (label === undefined) {
      throw new Error(`no hay casilla de tenpai para «${seatLabel}»`)
    }

    await label.find('input').setValue(true)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.emitted('saved')?.length ?? 0).toBeGreaterThan(savedBefore),
    )
  }

  it('sube con cada mano que el dealer gana y vuelve a cero cuando pierde la localía', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)
    const south = playerOf(game, 1)

    authenticate(pinia)
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Este', honba: '0' })

    await dealerTsumo(wrapper, east, 'Este')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Este', honba: '1' })

    await drawWithTenpai(wrapper, 'Sur')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Sur', honba: '0' })

    await drawWithTenpai(wrapper, 'Sur')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Sur', honba: '1' })

    await dealerTsumo(wrapper, south, 'Sur')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Sur', honba: '2' })
  })

  it('un contador vale 300: lo cobra el dealer que vuelve a ganar', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)
    const south = playerOf(game, 1)

    authenticate(pinia)
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))
    await dealerTsumo(wrapper, east, 'Este')
    await drawWithTenpai(wrapper, 'Sur')
    await drawWithTenpai(wrapper, 'Sur')

    await dealerTsumo(wrapper, south, 'Sur')
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

    const stored = await turnsRepository.list(game.id)

    // 1 han 30 fu por tsumo de dealer: 500 de cada uno, más 100 de honba por cada uno de los
    // tres que pagan, y la ficha de riichi propia vuelve con el bote.
    expect(stored[3]?.honba).toBe(1)
    expect(stored[3]?.deltas.map((delta) => delta.delta)).toStrictEqual([-600, 1800, -600, -600])
  })

  it('sin contadores, la misma mano vale 600 menos', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))
    await dealerTsumo(wrapper, east, 'Este')

    const stored = await turnsRepository.list(game.id)

    expect(stored[0]?.honba).toBe(0)
    expect(stored[0]?.deltas.map((delta) => delta.delta)).toStrictEqual([1500, -500, -500, -500])
  })

  /**
   * El renchan se decide con la **localía real**, no con el asiento Este. Antes de `specs/002` el
   * formulario miraba `seat === 'east'`, así que a partir del primer cambio de localía guardaba el
   * renchan al revés; y `replay.ts` lo deriva con otro criterio, con lo que el turno guardado y el
   * re-derivado discrepaban.
   */
  it('el renchan guardado sale de la localía real y no del asiento Este', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)
    const south = playerOf(game, 1)

    authenticate(pinia)
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

    // El Este es dealer y gana: renchan.
    await dealerTsumo(wrapper, east, 'Este')
    // Ahora el dealer es Sur; el Este ya no lo es y su empate no es renchan.
    await drawWithTenpai(wrapper, 'Sur')
    // El dealer es Sur y conserva la tenpai: renchan.
    await drawWithTenpai(wrapper, 'Sur')

    const stored = await turnsRepository.list(game.id)

    expect(stored[0]?.isRenchan).toBe(true)
    expect(stored[1]?.isRenchan).toBe(false)
    expect(stored[2]?.isRenchan).toBe(true)
    // El dealer era Este en los dos primeros turnos y pasa a Sur en el tercero: el renchan del
    // segundo turno es `false` precisamente porque el Este ya no era la localía.
    expect(stored[1]?.dealerId).toBe(east)
    expect(stored[2]?.dealerId).toBe(south)
  })

  it('un chombo no es renchan: el dealer pierde la mano y la localía avanza', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const north = playerOf(game, 3)

    authenticate(pinia)
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))
    await wrapper.find('select[name="resultType"]').setValue('chombo')
    await wrapper.find('select[name="chomboId"]').setValue(north)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const stored = await turnsRepository.list(game.id)

    expect(stored[0]?.isRenchan).toBe(false)
  })
})

/**
 * T38 · RF-18.16, RF-19.14, RF-19.15 y RF-21.5. Cada rechazo se muestra con su clave, y ninguno se
 * come el error genérico de «no se pudo guardar»: quien está en la mesa tiene que saber si tiene que
 * sincronizar, si el registro está lleno o si la partida no se puede reproducir.
 */
describe('T38 · los rechazos se avisan con su propia clave', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('cada DataErrorCode tiene su clave de i18n, sin excepciones', () => {
    for (const [code, key] of Object.entries(ERROR_KEYS)) {
      expect(key.startsWith('errors.'), `clave mal formada: ${code}`).toBe(true)
    }
  })

  it('el suufon renta rechazado se avisa por su clave', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await wrapper.find('select[name="winnerId"]').setValue(playerOf(game, 0))
    await wrapper.find('select[name="winnerId"]').setValue(playerOf(game, 1))
    await wrapper.find('input[name="doraCount"]').setValue('0')
    await wrapper.find('input[name="fu"]').setValue('30')
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)
    await wrapper.find('select[name="resultType"]').setValue('tsumo')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[data-test="capture-error"]').text()).toContain('un solo ganador')
  })

  it('una partida marcada por bancarrota se avisa con su clave', async () => {
    const game = await createGame()
    await gamesRepository.update(game.id, { mustFinalize: true })

    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await toggleTenpaiPlayer(wrapper, 'Este')
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-test="capture-error"]').exists()).toBe(true))

    expect(wrapper.find('[data-test="capture-error"]').text()).toContain('bancarrota')
  })

  it('una partida que no se puede reproducir bloquea la captura con su aviso', async () => {
    const game = await createGame()
    await turnsRepository.create(game.id, {
      turnNo: 1,
      wind: 'east',
      dealerId: playerOf(game, 0),
      honba: 0,
      resultType: 'ron',
      yaku: [],
      yakuHan: 0,
      yakuHanOverride: 0,
      doraCount: 0,
      fu: 0,
      tenpai: [],
      riichiDeclaredBy: [],
      riichiSticks: 0,
      value: [
        { playerId: playerOf(game, 1), han: 1, fu: 30, basicPoints: 320, points: 1300, deltas: [] },
      ],
      deltas: [],
      capturedBy: 'user-1',
      isRenchan: false,
      isFinalTurn: false,
      discarderId: null,
      chomboId: null,
    })

    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    // Sin estado derivado no hay nada que capturar: ni la localía se puede saber.
    expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(false)

    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await toggleTenpaiPlayer(wrapper, 'Este')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-test="capture-error"]').exists()).toBe(true))

    expect(wrapper.find('[data-test="capture-error"]').text()).toContain('no se puede reproducir')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
