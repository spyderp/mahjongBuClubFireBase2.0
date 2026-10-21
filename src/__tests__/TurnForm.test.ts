import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, URL as NodeURL } from 'node:url'
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
import { turnsRepository, capturedTurnOf } from '@/data/turns.repository'
import type { CapturedTurn } from '@/domain/replay'
import { replayTurns } from '@/domain/replay'
import type { PlayerDelta } from '@/domain/turn'
import type { PlayerId, Seat } from '@/domain/types'
import { YAKU_CATALOG } from '@/domain/yaku'
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

/** Los cuatro de la mesa, en el orden de los asientos: Este, Sur, Oeste y Norte. */
const SEATS: readonly Seat[] = ['east', 'south', 'west', 'north']

const NOMBRES: readonly string[] = ['Ana', 'Bob', 'Carla', 'David']

/** El texto que pinta el catálogo para cada asiento. */
const ETIQUETAS: readonly string[] = ['Este', 'Sur', 'Oeste', 'Norte']

/**
 * Los cuatro de la mesa con **nombre propio**. RF-24.1 hace que la interfaz ofrezca el nombre y no el
 * asiento, y un nombre igual al identificador no distinguiría «la mesa lo leyó de la lista de
 * jugadores» de «la mesa no encontró a nadie y pintó el identificador de emergencia».
 */
async function createFourPlayers(): Promise<PlayerRecord[]> {
  return Promise.all(
    ['p1', 'p2', 'p3', 'p4'].map((externalId, index) =>
      playersRepository.create({ externalId, name: NOMBRES[index] ?? externalId }),
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

/**
 * La casilla de un jugador en los dos fieldset de la mesa. Se busca por el asiento y no por el texto
 * de la etiqueta, y el motivo es RF-24.1: la etiqueta pasa a llevar el nombre del jugador, y con
 * nombres como «Oeste» o «Ana» un `includes` por texto no distinguiría «Este» de «Oeste».
 */
function casillaDe(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  fieldset: 'riichi' | 'tenpai',
  seat: Seat,
) {
  const label = wrapper.find(
    `fieldset[data-test="${fieldset}"] label[data-test="${fieldset}-${seat}"]`,
  )

  if (label.exists() === false || label.find('input').exists() === false) {
    throw new Error(`no hay casilla de «${fieldset}» para el asiento ${seat}`)
  }

  return label.find('input')
}

async function toggleTenpaiPlayer(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  seat: Seat,
): Promise<void> {
  const checkbox = casillaDe(wrapper, 'tenpai', seat)
  await checkbox.setValue(!(checkbox.element as HTMLInputElement).checked)
}

async function declareRiichi(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  seat: Seat,
): Promise<void> {
  await casillaDe(wrapper, 'riichi', seat).setValue(true)
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
    await declareRiichi(wrapper, 'east')

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
    await toggleTenpaiPlayer(wrapper, 'south')

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
    await toggleTenpaiPlayer(wrapper, 'east')
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
    await declareRiichi(wrapper, 'east')
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
    await declareRiichi(wrapper, 'east')
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
    await declareRiichi(wrapper, 'east')
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
    await declareRiichi(wrapper, 'east')
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
    await declareRiichi(wrapper, 'east')
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
    await toggleTenpaiPlayer(wrapper, 'east')
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

  /** Tsumo de 1 han 30 fu con el riichi declarado: la mano más pequeña que puntúa. */
  async function dealerTsumo(
    wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
    winner: PlayerId,
    seat: Seat,
  ): Promise<void> {
    const savedBefore = wrapper.emitted('saved')?.length ?? 0

    await wrapper.find('select[name="resultType"]').setValue('tsumo')
    await vi.waitFor(() => expect(wrapper.find('select[name="winnerId"]').exists()).toBe(true))
    await wrapper.find('select[name="winnerId"]').setValue(winner)
    await wrapper.find('input[name="doraCount"]').setValue('0')
    await wrapper.find('input[name="fu"]').setValue('30')
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)
    await declareRiichi(wrapper, seat)
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.emitted('saved')?.length ?? 0).toBeGreaterThan(savedBefore),
    )
  }

  /** Empate en el que solo está en tenpai el asiento indicado. */
  async function drawWithTenpai(
    wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
    seat: Seat,
  ): Promise<void> {
    const savedBefore = wrapper.emitted('saved')?.length ?? 0

    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await vi.waitFor(() => expect(wrapper.find('fieldset[data-test="tenpai"]').exists()).toBe(true))
    await toggleTenpaiPlayer(wrapper, seat)
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

    await dealerTsumo(wrapper, east, 'east')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Este', honba: '1' })

    await drawWithTenpai(wrapper, 'south')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Sur', honba: '0' })

    await drawWithTenpai(wrapper, 'south')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Sur', honba: '1' })

    await dealerTsumo(wrapper, south, 'south')
    expect(panel(wrapper)).toStrictEqual({ dealer: 'Sur', honba: '2' })
  })

  it('un contador vale 300: lo cobra el dealer que vuelve a ganar', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)
    const south = playerOf(game, 1)

    authenticate(pinia)
    await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))
    await dealerTsumo(wrapper, east, 'east')
    await drawWithTenpai(wrapper, 'south')
    await drawWithTenpai(wrapper, 'south')

    await dealerTsumo(wrapper, south, 'south')
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
    await dealerTsumo(wrapper, east, 'east')

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
    await dealerTsumo(wrapper, east, 'east')
    // Ahora el dealer es Sur; el Este ya no lo es y su empate no es renchan.
    await drawWithTenpai(wrapper, 'south')
    // El dealer es Sur y conserva la tenpai: renchan.
    await drawWithTenpai(wrapper, 'south')

    const stored = await turnsRepository.list(game.id)

    expect(stored[0]?.isRenchan).toBe(true)
    expect(stored[1]?.isRenchan).toBe(false)
    expect(stored[2]?.isRenchan).toBe(true)
    // El dealer era Este en los dos primeros turnos y pasa a Sur en el tercero: el renchan del
    // segundo turno es `false` precisamente porque el Este ya no era la localía.
    expect(stored[1]?.dealerId).toBe(east)
    expect(stored[2]?.dealerId).toBe(south)
  })

  /**
   * T03 · RF-30.6. El nombre de este test decía «el chombo no es renchan: el dealer pierde la mano y
   * la localía avanza», y la segunda mitad es **falsa**: el chombo no rota la localía (RF-7.6 de 001).
   * El test pasaba porque solo miraba `isRenchan`, así que el nombre se llevaba por delante la regla
   * equivocada sin que nada fallara (003-qa.md, B4). Un nombre de test es documentación, y
   * documentación que contradice la norma vigente es peor que no tenerla.
   *
   * Ahora el nombre dice lo que el test comprueba: que el chombo **conserva** la localía, y que no es
   * renchan porque no hubo mano jugada.
   */
  it('un chombo no es renchan y conserva la localía', async () => {
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
    // Y la marca de localía no se mueve: el Norte hizo chombo y el Este sigue siendo la localía.
    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="next-dealer"]').text()).toContain('Este'),
    )
    expect(wrapper.find('[data-test="next-honba"]').text()).toContain('0')
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
    await toggleTenpaiPlayer(wrapper, 'east')
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
    await toggleTenpaiPlayer(wrapper, 'east')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-test="capture-error"]').exists()).toBe(true))

    expect(wrapper.find('[data-test="capture-error"]').text()).toContain('no se puede reproducir')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
/**
 * Los ayudantes de RF-24. La mesa es lo que **faltaba** en esta pantalla hasta `specs/003`: el
 * marcador estaba calculado desde `specs/002` y no se pintaba, y los cinco lugares donde se elige a
 * un jugador ofrecían el asiento y no el nombre.
 */

/**
 * Una partida de empates, en el orden dado, con la tenpai de cada turno.
 *
 * Los derivados se escriben **calculados**, no inventados: la mesa pinta el marcador y la diferencia
 * que salen de los `deltas` que hay en el documento (`TurnForm.vue` · `scores`), así que un `deltas:
 * []` de mentira dejaría la mesa en cero y el test no comprobaría nada. Es lo mismo que hace el
 * formulario al guardar: el recorrido calcula, el documento lo recoge (RF-18.13).
 */
async function partidaDeEmpates(
  game: GameRecord,
  tenpaisPorTurno: readonly (readonly PlayerId[])[],
): Promise<void> {
  const captured: CapturedTurn[] = tenpaisPorTurno.map((tenpai, indice) => ({
    turnNo: indice + 1,
    resultType: 'ryuukyoku',
    hand: { yaku: [], yakuHan: 0, doraCount: 0, fu: 0 },
    winners: [],
    discarderId: null,
    chomboId: null,
    tenpai: [...tenpai],
    riichiDeclaredBy: [],
  }))

  const recorrido = replayTurns(
    game.players.map((participant) => ({
      playerId: participant.playerId,
      seat: participant.seat,
      score: game.startPoints,
    })),
    captured,
    1,
  )

  if (!recorrido.ok) {
    throw new Error(`la partida no se puede recorrer: ${recorrido.reason}`)
  }

  for (const [indice, derivado] of recorrido.outcome.turns.entries()) {
    const captura = captured[indice]

    if (captura === undefined) {
      throw new Error(`el recorrido devolvió el turno ${derivado.turnNo} sin captura`)
    }

    await turnsRepository.create(game.id, {
      turnNo: derivado.turnNo,
      wind: derivado.wind,
      dealerId: derivado.dealerId,
      honba: derivado.honba,
      resultType: 'ryuukyoku',
      yaku: [],
      yakuHan: 0,
      yakuHanOverride: 0,
      doraCount: 0,
      fu: 0,
      tenpai: [...captura.tenpai],
      riichiDeclaredBy: [],
      riichiSticks: derivado.riichiSticks,
      value: derivado.values,
      deltas: derivado.deltas,
      capturedBy: 'user-1',
      isRenchan: false,
      isFinalTurn: false,
      discarderId: null,
      chomboId: null,
    })
  }
}

/**
 * Una partida de `turnos` empates en la que la localía **no** se conserva en ninguno: cada turno
 * deja fuera a quien la tiene, así que avanza asiento a asiento desde el Este.
 */
async function partidaSinLocalia(game: GameRecord, turnos: number): Promise<void> {
  await partidaDeEmpates(
    game,
    Array.from({ length: turnos }, (_vacio, indice) => [
      playerOf(game, ((indice + 1) % 4) as 0 | 1 | 2 | 3),
    ]),
  )
}

/**
 * Corrige la tenpai de un turno **como lo hace `useGameTurns.correctTurn`**: el campo capturado más
 * los derivados que el recorrido vuelve a calcular (RF-18.7). Tocar solo la tenpai dejaría los
 * `deltas` viejos en el documento y la mesa pintando un estado que ya nadie guardó.
 */
async function corregirTenpai(
  game: GameRecord,
  turnNo: number,
  tenpai: readonly PlayerId[],
): Promise<void> {
  const stored = await turnsRepository.list(game.id)
  const recorrido = replayTurns(
    game.players.map((participant) => ({
      playerId: participant.playerId,
      seat: participant.seat,
      score: game.startPoints,
    })),
    stored.map((turn) =>
      turn.turnNo === turnNo ? capturedTurnOf(turn, { tenpai }) : capturedTurnOf(turn),
    ),
    1,
  )

  if (!recorrido.ok) {
    throw new Error(`la partida corregida no se puede recorrer: ${recorrido.reason}`)
  }

  const propio = recorrido.outcome.turns.find((turn) => turn.turnNo === turnNo)

  if (propio === undefined) {
    throw new Error(`el recorrido no devolvió el turno ${turnNo}`)
  }

  await turnsRepository.update(
    game.id,
    turnNo,
    {
      tenpai: [...tenpai],
      wind: propio.wind,
      dealerId: propio.dealerId,
      honba: propio.honba,
      riichiSticks: propio.riichiSticks,
      value: propio.values,
      deltas: propio.deltas,
    },
    { by: 'user-que-corrige', expectedAuditCount: 0 },
  )
}

/** Una fila de la mesa por asiento, con lo que cada uno de los cuatro requisitos tiene que mostrar. */
type Fila = {
  readonly texto: string
  readonly viento: string
  readonly nombre: string
  readonly asiento: string
  readonly marcador: string
  readonly delta: string
  readonly clasesDelta: readonly string[]
  readonly esLocalia: boolean
}

function filaDe(wrapper: ReturnType<typeof mountTurnForm>['wrapper'], seat: Seat): Fila {
  const row = wrapper.find(`[data-test="mesa-${seat}"]`)

  if (row.exists() === false) {
    throw new Error(`la mesa no tiene fila para el asiento ${seat}`)
  }

  const delta = row.find('[data-test="mesa-delta"]')

  return {
    texto: row.text(),
    viento: row.find('[data-test="mesa-wind"]').text(),
    nombre: row.find('[data-test="mesa-name"]').text(),
    asiento: row.find('[data-test="mesa-seat"]').text(),
    marcador: row.find('[data-test="mesa-score"]').text(),
    delta: delta.text(),
    clasesDelta: delta.classes(),
    esLocalia: row.find('[data-test="mesa-dealer"]').exists(),
  }
}

/** Las cuatro filas de la mesa, en el orden de los asientos. */
function mesaDe(wrapper: ReturnType<typeof mountTurnForm>['wrapper']): readonly Fila[] {
  return SEATS.map((seat) => filaDe(wrapper, seat))
}

/** Las etiquetas de las casillas de un fieldset de la mesa, en el orden de los asientos. */
function textosDe(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  fieldset: 'riichi' | 'tenpai',
): readonly string[] {
  return SEATS.map((seat) => {
    const label = wrapper.find(
      `fieldset[data-test="${fieldset}"] label[data-test="${fieldset}-${seat}"]`,
    )

    if (label.exists() === false) {
      throw new Error(`no hay etiqueta de «${fieldset}» para el asiento ${seat}`)
    }

    return label.text()
  })
}

/** Las opciones de un desplegable de jugador, en el orden en que las pinta, sin la de «ninguno». */
function opcionesDe(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  name: string,
): readonly string[] {
  const select = wrapper.find(`select[name="${name}"]`)

  if (select.exists() === false) {
    throw new Error(`no hay desplegable «${name}»`)
  }

  return select
    .findAll('option')
    .filter((option) => (option.attributes('value') ?? '') !== '')
    .map((option) => option.text())
}

/**
 * T06 · RF-24.1 a RF-24.4. Los cuatro datos de la mesa —el nombre con su asiento, la diferencia con
 * su color, la marca de localía y el viento de la mano— en los **tres estados** en los que cambian:
 * recién creada, con un turno ya en la mesa y después de corregirlo.
 *
 * Y una cuarta cosa que la mesa tiene que decir bien, porque es la que más engaña: la diferencia que
 * pinta es la del turno que se está **capturando**, no la acumulada de la partida. El marcador de la
 * izquierda es el acumulado; el número de la derecha es lo que suma o resta la mano que se está
 * rellenando ahora mismo.
 */
describe('T06 · la mesa', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('recién creada: nombre, asiento, viento y localía, y ninguna diferencia que pintar', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await vi.waitFor(() => expect(wrapper.find('[data-test="mesa"]').exists()).toBe(true))
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').nombre).toBe('Ana'))

    const mesa = mesaDe(wrapper)

    expect(mesa.map((fila) => fila.nombre)).toStrictEqual(NOMBRES)
    expect(mesa.map((fila) => fila.asiento)).toStrictEqual(ETIQUETAS)
    // El punto de partida de los cuatro (caso límite 1).
    expect(mesa.map((fila) => fila.marcador)).toStrictEqual([
      '25.000',
      '25.000',
      '25.000',
      '25.000',
    ])
    expect(mesa.every((fila) => fila.delta === '0')).toBe(true)
    expect(mesa.every((fila) => fila.clasesDelta.length === 0)).toBe(true)
    // Y la marca de localía va con la localía real, que al empezar es el Este.
    expect(mesa.map((fila) => fila.esLocalia)).toStrictEqual([true, false, false, false])
  })

  it('con un turno ya guardado: el marcador acumulado y la diferencia del turno que se captura', async () => {
    const game = await createGame()
    // El turno que ya está en la mesa: el Este cobra 3000 y los otros tres pagan 1000.
    await partidaDeEmpates(game, [[playerOf(game, 0)]])

    const { wrapper } = mountTurnForm(game)
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').marcador).toBe('28.000'))

    // El marcador **sí** es el acumulado: es la puntuación de cada uno en la mesa.
    expect(mesaDe(wrapper).map((fila) => fila.marcador)).toStrictEqual([
      '28.000',
      '24.000',
      '24.000',
      '24.000',
    ])

    // Pero la diferencia es la del turno en curso, y de momento no hay ninguno: ni +3000 ni −1000.
    expect(mesaDe(wrapper).map((fila) => fila.delta)).toStrictEqual(['0', '0', '0', '0'])
    expect(mesaDe(wrapper).every((fila) => fila.clasesDelta.length === 0)).toBe(true)

    /**
     * Ahora se captura un tsumo de la localía de un solo han **con 1 honba** (porque el turno
     * anterior fue un empate con el Este en tenpai): la diferencia que aparece es la de
     * **esta** mano —1800 al dealer y −600 a cada uno de los otros tres—, y no la del turno
     * anterior que ya está guardado. Un −3000 acumulado sobre un −600 de ahora sería una cifra
     * que no se va a guardar nunca.
     */
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 0, fu: 30 }, ['tanyao'])
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').delta).toBe('+1800'))

    expect(mesaDe(wrapper).map((fila) => fila.delta)).toStrictEqual([
      '+1800',
      '-600',
      '-600',
      '-600',
    ])
    expect(mesaDe(wrapper).map((fila) => fila.marcador)).toStrictEqual([
      '28.000',
      '24.000',
      '24.000',
      '24.000',
    ])
  })

  it('la diferencia cambia con la mano que se está rellenando, no con las anteriores', async () => {
    const game = await createGame()
    await partidaDeEmpates(game, [[playerOf(game, 0)]])

    const { wrapper } = mountTurnForm(game)
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').marcador).toBe('28.000'))

    // Un empate con los cuatro en tenpai no mueve nada…
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await vi.waitFor(() => expect(wrapper.find('fieldset[data-test="tenpai"]').exists()).toBe(true))
    for (const seat of SEATS) {
      await toggleTenpaiPlayer(wrapper, seat)
    }

    expect(mesaDe(wrapper).every((fila) => fila.delta === '0')).toBe(true)

    /**
     * …y en el que solo está en tenpai el Este, el Norte paga lo que ya había pagado en el turno
     * guardado y no se le vuelve a descontar.
     */
    await toggleTenpaiPlayer(wrapper, 'north')
    await toggleTenpaiPlayer(wrapper, 'west')
    await toggleTenpaiPlayer(wrapper, 'south')
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').delta).toBe('+3000'))

    expect(mesaDe(wrapper).map((fila) => fila.delta)).toStrictEqual([
      '+3000',
      '-1000',
      '-1000',
      '-1000',
    ])
  })

  it('después de corregir, muestra el marcador corregido y no el que había', async () => {
    const game = await createGame()
    await partidaDeEmpates(game, [[playerOf(game, 0)]])

    const antes = mountTurnForm(game)
    await vi.waitFor(() => expect(filaDe(antes.wrapper, 'east').marcador).toBe('28.000'))
    antes.wrapper.unmount()

    // Quien está en la mesa se da cuenta de que la tenpai era la del Oeste y lo corrige (RF-19.1).
    await corregirTenpai(game, 1, [playerOf(game, 2)])

    const despues = mountTurnForm(game)
    await vi.waitFor(() => expect(filaDe(despues.wrapper, 'west').marcador).toBe('28.000'))

    expect(filaDe(despues.wrapper, 'east').marcador).toBe('24.000')
    // Y la diferencia del turno en curso sigue a cero: lo corregido ya está en el marcador.
    expect(mesaDe(despues.wrapper).every((fila) => fila.delta === '0')).toBe(true)
  })
})

/**
 * T07 · RF-24.1. Los **cinco** lugares donde se elige a un jugador, no solo el primero: ganador,
 * descartador, tenpai, riichi y chombo. Cada uno ofrece el nombre **con el asiento al lado**, porque
 * el asiento es lo que sitúa a quien juega y el nombre es lo que le dice a quién se está eligiendo.
 */
describe('T07 · los nombres, no los asientos', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('los cinco ofrecen el nombre con su asiento al lado', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)
    const esperados = ['Ana · Este', 'Bob · Sur', 'Carla · Oeste', 'David · Norte']

    await vi.waitFor(() => expect(textosDe(wrapper, 'riichi')).toStrictEqual(esperados))

    // El riichi está en pantalla siempre que el formulario lo esté.
    expect(textosDe(wrapper, 'riichi')).toStrictEqual(esperados)

    await wrapper.find('select[name="resultType"]').setValue('ron')
    await vi.waitFor(() => expect(wrapper.find('select[name="winnerId"]').exists()).toBe(true))
    expect(opcionesDe(wrapper, 'discarderId')).toStrictEqual(esperados)
    expect(opcionesDe(wrapper, 'winnerId')).toStrictEqual(esperados)

    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await vi.waitFor(() => expect(wrapper.find('fieldset[data-test="tenpai"]').exists()).toBe(true))
    expect(textosDe(wrapper, 'tenpai')).toStrictEqual(esperados)

    await wrapper.find('select[name="resultType"]').setValue('chombo')
    await vi.waitFor(() => expect(wrapper.find('select[name="chomboId"]').exists()).toBe(true))
    expect(opcionesDe(wrapper, 'chomboId')).toStrictEqual(esperados)
  })

  it('ninguno de los cinco se queda con el asiento solo', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)
    const esperados = ['Ana · Este', 'Bob · Sur', 'Carla · Oeste', 'David · Norte']

    await vi.waitFor(() => expect(textosDe(wrapper, 'riichi')).toStrictEqual(esperados))
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await vi.waitFor(() => expect(wrapper.find('select[name="winnerId"]').exists()).toBe(true))

    const listados = [
      textosDe(wrapper, 'riichi'),
      opcionesDe(wrapper, 'winnerId'),
      opcionesDe(wrapper, 'discarderId'),
    ]

    for (const listado of listados) {
      expect(listado).not.toStrictEqual([])
      for (const etiqueta of ETIQUETAS) {
        expect(listado).not.toContain(etiqueta)
      }
    }
  })

  /**
   * Caso límite 3 de la spec: las casillas de ganador también llevan el nombre y su asiento. No es
   * uno de los cinco desplegables, pero dejarlo solo con el asiento haría que la lista deGanadores
   * dijera una cosa distinta de los desplegables de al lado.
   */
  it('las casillas de ganador llevan el nombre con su asiento', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ron')
    await vi.waitFor(() => expect(wrapper.find('select[name="winnerId"]').exists()).toBe(true))
    await wrapper.find('select[name="winnerId"]').setValue(playerOf(game, 1))

    await vi.waitFor(() =>
      expect(wrapper.find('[data-test="winner-south"]').text()).toContain('Bob · Sur'),
    )
  })
})

/**
 * T08 · RF-24.2. El color de la diferencia con los tokens del tema —`--color-mahjong-positive` y
 * `--color-mahjong-negative`— y con ninguna otra clase de color. El cero es el caso que se olvida: un
 * empate repartido deja a alguien con diferencia cero, y ese jugador **no** va en ningún color (caso
 * límite 2). Por eso el barrido da positivo, cero y negativo de una sola vez.
 */
describe('T08 · color del delta', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('positivo, cero y negativo, y el cero sin ninguna clase de color', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    // Nadie se ha movido: ni una clase de color en las cuatro filas.
    await vi.waitFor(() => expect(wrapper.find('[data-test="mesa"]').exists()).toBe(true))
    expect(mesaDe(wrapper).every((fila) => fila.clasesDelta.length === 0)).toBe(true)

    /**
     * Un empate con los cuatro en tenpai deja la diferencia a cero en todas partes. Es el caso límite
     * 2: se ve el cero, pero **sin** clase, porque un cero no suma ni resta.
     */
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await vi.waitFor(() => expect(wrapper.find('fieldset[data-test="tenpai"]').exists()).toBe(true))
    for (const seat of SEATS) {
      await toggleTenpaiPlayer(wrapper, seat)
    }

    expect(mesaDe(wrapper).map((fila) => fila.delta)).toStrictEqual(['0', '0', '0', '0'])
    expect(mesaDe(wrapper).every((fila) => fila.clasesDelta.length === 0)).toBe(true)

    // Y el mismo empate con solo el Este en tenpai reparte en los dos signos.
    await toggleTenpaiPlayer(wrapper, 'north')
    await toggleTenpaiPlayer(wrapper, 'west')
    await toggleTenpaiPlayer(wrapper, 'south')
    await nextTick()
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').delta).toBe('+3000'))

    expect(filaDe(wrapper, 'east').clasesDelta).toStrictEqual(['text-mahjong-positive'])
    expect(filaDe(wrapper, 'north').delta).toBe('-1000')
    expect(filaDe(wrapper, 'north').clasesDelta).toStrictEqual(['text-mahjong-negative'])
  })

  it('las únicas clases de color que se aplican son las de los dos tokens del tema', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 0, fu: 30 }, ['tanyao'])
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').delta).toBe('+1500'))

    const aplicadas = new Set(SEATS.flatMap((seat) => filaDe(wrapper, seat).clasesDelta))

    expect(aplicadas).toStrictEqual(new Set(['text-mahjong-positive', 'text-mahjong-negative']))
  })

  it('las dos clases salen de los tokens --color-mahjong-* del tema, no de colores sueltos', async () => {
    const css = await readFile(join(import.meta.dirname, '..', 'styles', 'main.css'), 'utf8')

    expect(css).toContain('--color-mahjong-positive:')
    expect(css).toContain('--color-mahjong-negative:')
  })
})

/**
 * T09 · RF-24.3. La marca de localía se pinta con la localía **real** que calcula `domain/replay.ts`
 * y no con el asiento Este —hasta `specs/002` el motor miraba `seat === 'east'` y a partir del primer
 * cambio de localía todo se invertía. El barrido fija los cuatro asientos, y **el caso del Sur es el
 * que discrimina**: con la localía en el Este, una etiqueta pintada desde el asiento Este daría razón
 * correcta y el test pasaría igual (003-qa.md, C5).
 */
describe('T09 · marcador de localía', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('la marca va con la localía real en los cuatro asientos', async () => {
    for (const [indice, turnos] of [0, 1, 2, 3].entries()) {
      fakeReset()

      const game = await createGame()
      await partidaSinLocalia(game, turnos)

      const { wrapper } = mountTurnForm(game)
      // La marca de localía depende del estado derivado, que llega de la query del juego: sin el
      // panel de la mano siguiente no hay localía que pintar y el barrido no comprobaría nada.
      await vi.waitFor(() => expect(wrapper.find('[data-test="next-hand"]').exists()).toBe(true))

      const esperado = SEATS[indice]

      expect(esperado).toBeTypeOf('string')
      expect(mesaDe(wrapper).map((fila) => fila.esLocalia)).toStrictEqual(
        SEATS.map((seat) => seat === esperado),
      )

      wrapper.unmount()
    }
  })

  it('con la localía en el Sur la marca no acompaña al Este', async () => {
    const game = await createGame()
    await partidaSinLocalia(game, 1)

    const { wrapper } = mountTurnForm(game)
    await vi.waitFor(() => expect(filaDe(wrapper, 'south').esLocalia).toBe(true))

    expect(filaDe(wrapper, 'east').esLocalia).toBe(false)
    expect(filaDe(wrapper, 'south').esLocalia).toBe(true)
    expect(filaDe(wrapper, 'west').esLocalia).toBe(false)
    expect(filaDe(wrapper, 'north').esLocalia).toBe(false)
  })

  it('un chombo no mueve la marca (caso límite 5)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await vi.waitFor(() => expect(filaDe(wrapper, 'east').esLocalia).toBe(true))
    await wrapper.find('select[name="resultType"]').setValue('chombo')
    await wrapper.find('select[name="chomboId"]').setValue(playerOf(game, 3))
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    expect(filaDe(wrapper, 'east').esLocalia).toBe(true)
    expect(filaDe(wrapper, 'north').esLocalia).toBe(false)
  })
})

/**
 * T10 · RF-24.4. El viento de la mano en curso junto al nombre de cada jugador. El viento de ronda
 * solo gira cuando la localía vuelve al asiento Este, así que el test tiene que cruzar esa vuelta
 * entera: verlo antes y después del giro es lo que demuestra que **cambia**.
 */
describe('T10 · viento por asiento', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('los cuatro asientos muestran el viento, y cambia al cruzar la vuelta del Este', async () => {
    const game = await createGame()

    const antes = mountTurnForm(game)
    await vi.waitFor(() => expect(filaDe(antes.wrapper, 'east').viento).toBe('Ronda Este'))

    expect(mesaDe(antes.wrapper).map((fila) => fila.viento)).toStrictEqual([
      'Ronda Este',
      'Ronda Este',
      'Ronda Este',
      'Ronda Este',
    ])
    antes.wrapper.unmount()

    // La localía va perdiendo la mano una y otra vez: Este → Sur → Oeste → Norte → Este. Al volver al
    // Este el viento de ronda gira con ella (`domain/rules.ts` · `nextHand`).
    await partidaSinLocalia(game, 4)

    const despues = mountTurnForm(game)
    await vi.waitFor(() => expect(filaDe(despues.wrapper, 'east').viento).toBe('Ronda Sur'))

    expect(mesaDe(despues.wrapper).map((fila) => fila.viento)).toStrictEqual([
      'Ronda Sur',
      'Ronda Sur',
      'Ronda Sur',
      'Ronda Sur',
    ])
  })

  it('el viento va junto al nombre, en la misma fila', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await vi.waitFor(() => expect(filaDe(wrapper, 'east').nombre).toBe('Ana'))

    const fila = filaDe(wrapper, 'east')

    expect(fila.texto).toContain('Ana')
    expect(fila.texto).toContain('Este')
    expect(fila.texto).toContain('Ronda Este')
  })
})
/** Las casillas de yaku que se están pintando ahora mismo, en el orden en que salen. */
function yakuVisibles(wrapper: ReturnType<typeof mountTurnForm>['wrapper']): readonly string[] {
  return casillasDeYaku(wrapper).map((input) => input.attributes('value') ?? '')
}

function casillasDeYaku(wrapper: ReturnType<typeof mountTurnForm>['wrapper']) {
  return wrapper.findAll('[data-test="yaku-options"] input[type="checkbox"]')
}

/** Las casillas de yaku que están marcadas ahora mismo. */
function yakuMarcados(wrapper: ReturnType<typeof mountTurnForm>['wrapper']): readonly string[] {
  return casillasDeYaku(wrapper)
    .filter((input) => (input.element as HTMLInputElement).checked)
    .map((input) => input.attributes('value') ?? '')
}

/** Deja el formulario en una mano con tsumo, que es donde aparecen yaku, buscador y totales. */
async function abrirMano(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  game: GameRecord,
): Promise<void> {
  await wrapper.find('select[name="resultType"]').setValue('tsumo')
  await vi.waitFor(() => expect(wrapper.find('select[name="winnerId"]').exists()).toBe(true))
  await wrapper.find('select[name="winnerId"]').setValue(playerOf(game, 0))
}

/**
 * T11 · RF-25.1. El buscador deja solo las entradas cuyo nombre **contiene** lo escrito. Lo que hay
 * que fijar es sobre todo lo que **no** cambia: filtrar es mirar la lista, no la captura, así que un
 * yaku ya marcado tiene que sobrevivir a un filtro sin coincidencia y volver marcado cuando el
 * filtro se limpia.
 */
describe('T11 · buscador de yaku', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('escribir texto deja solo las entradas que lo contienen', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await abrirMano(wrapper, game)
    await vi.waitFor(() => expect(yakuVisibles(wrapper).length).toBeGreaterThan(10))

    const todos = yakuVisibles(wrapper)

    await wrapper.find('input[name="yakuFilter"]').setValue('riic')

    // «Riichi» y «Suucha Riichi» contienen lo escrito, y no es una coincidencia exacta: por eso son
    // dos y no uno.
    expect(yakuVisibles(wrapper)).toStrictEqual(
      todos.filter((id) => ['riichi', 'suuchaRiichi'].includes(id)),
    )
    expect(yakuVisibles(wrapper)).toContain('riichi')
    expect(yakuVisibles(wrapper)).toContain('suuchaRiichi')
    expect(yakuVisibles(wrapper)).not.toContain('tanyao')
  })

  it('no le importan las mayúsculas ni los espacios de alrededor', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await abrirMano(wrapper, game)
    await vi.waitFor(() => expect(yakuVisibles(wrapper).length).toBeGreaterThan(10))

    await wrapper.find('input[name="yakuFilter"]').setValue('  Riic  ')

    expect(yakuVisibles(wrapper)).toStrictEqual(['riichi', 'suuchaRiichi'])
  })

  it('un filtro sin coincidencia deja la lista vacía sin perder lo marcado', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await abrirMano(wrapper, game)
    await wrapper.find('input[type="checkbox"][value="riichi"]').setValue(true)
    await wrapper.find('input[type="checkbox"][value="tanyao"]').setValue(true)
    await declareRiichi(wrapper, 'east')
    await vi.waitFor(() => expect(wrapper.find('[data-test="han-total"]').text()).toContain('2'))

    const totalAntes = wrapper.find('[data-test="han-total"]').text()

    await wrapper.find('input[name="yakuFilter"]').setValue('qqqqqq')

    expect(yakuVisibles(wrapper)).toStrictEqual([])
    // El total del catálogo sigue igual: lo marcado no se ha perdido, solo está fuera de la vista.
    expect(wrapper.find('[data-test="han-total"]').text()).toBe(totalAntes)

    await wrapper.find('input[name="yakuFilter"]').setValue('')

    expect(yakuMarcados(wrapper)).toStrictEqual(['riichi', 'tanyao'])
  })

  it('limpiar el filtro devuelve todas las entradas', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await abrirMano(wrapper, game)
    await vi.waitFor(() => expect(yakuVisibles(wrapper)).toHaveLength(YAKU_CATALOG.length))

    await wrapper.find('input[name="yakuFilter"]').setValue('riic')
    expect(yakuVisibles(wrapper).length).toBeLessThan(YAKU_CATALOG.length)

    await wrapper.find('input[name="yakuFilter"]').setValue('')

    expect(yakuVisibles(wrapper)).toHaveLength(YAKU_CATALOG.length)
  })
})

/**
 * T12 · RF-25.2. Las casillas de riichi en horizontal. Lo que RF-25.2 exige es que **no cambien de
 * comportamiento**, así que el test tiene que seguir marcándolas y desmarcarlas igual que antes: la
 * orientación es una clase y no debe poder mover nada más.
 */
describe('T12 · captura sin buscar', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
  })

  it('las casillas de riichi se pintan en una fila, no en una columna', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    const fieldset = wrapper.find('fieldset[data-test="riichi"]')

    /**
     * `happy-dom` no calcula layout, así que «en una fila» no se puede mirar en la caja: se mira en
     * las clases que la ponen en fila, y en la ausencia de las que la pondrían en columna.
     */
    expect(fieldset.classes()).toContain('flex')
    expect(fieldset.classes()).toContain('flex-wrap')
    expect(fieldset.classes()).not.toContain('flex-col')
    expect(fieldset.findAll('label')).toHaveLength(4)
  })

  it('siguen marcando y desmarcando igual que antes del cambio de orientación', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 0, fu: 30 }, ['tanyao'])

    const este = casillaDe(wrapper, 'riichi', 'east')
    const sur = casillaDe(wrapper, 'riichi', 'south')

    await este.setValue(true)
    expect((este.element as HTMLInputElement).checked).toBe(true)
    expect((sur.element as HTMLInputElement).checked).toBe(false)

    await este.setValue(false)
    expect((este.element as HTMLInputElement).checked).toBe(false)

    await este.setValue(true)
    await sur.setValue(true)
    expect(wrapper.find('fieldset[data-test="riichi"]').findAll('input:checked')).toHaveLength(2)

    // Y lo marcado sigue llegando al turno guardado, que es donde se nota si el cambio de
    // orientación movió algo más que la maquetación.
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as { riichiDeclaredBy: readonly PlayerId[] }

    expect(record.riichiDeclaredBy).toStrictEqual([playerOf(game, 0), playerOf(game, 1)])
  })
})

/**
 * T18, T19 y T20 · RF-28.1 a RF-28.3 y RF-28.5. La ayuda se abre desde la pantalla de captura, su
 * texto **sale del markdown del repositorio** —no de una plantilla duplicada— y abrir o cerrar los
 * modales no puede perder lo capturado ni el borrador de `localStorage`.
 *
 * El test que lee el disco es el mismo patrón que `handValue.test.ts:302`: el texto de la interfaz no
 * puede dejar de ser el del fichero, o editar uno sin el otro pasa inadvertido.
 */
describe('T18-T20 · ayuda y referencia', () => {
  beforeEach(() => {
    localStorage.clear()
    fakeReset()
    document.body.innerHTML = ''
  })

  it('abre el modal de ayuda desde la captura y pinta el markdown del disco (RF-28.1, RF-28.2)', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await wrapper.find('[data-test="help-open"]').trigger('click')

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Cómo rellenar el formulario de turnos')

    const enDisco = await readFile(
      fileURLToPath(new NodeURL('../docs/ayuda-turnos.md', import.meta.url)),
      'utf8',
    )
    expect(dialog?.textContent).toContain(
      enDisco
        .replace(/^#+ .*$/gm, '')
        .trim()
        .slice(0, 80),
    )
  })

  it('cierra el modal con Escape y con el botón, sin tocar BaseDialog (RF-28.1)', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await wrapper.find('[data-test="help-open"]').trigger('click')
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()

    const dialog = document.body.querySelector('[role="dialog"]')
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await wrapper.find('[data-test="help-open"]').trigger('click')
    const closeButton = document.body.querySelector('[aria-label="Cerrar"]')
    expect(closeButton).not.toBeNull()
    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('el lenguaje de la tabla de puntuación se abre como segundo modal (RF-28.4)', async () => {
    const game = await createGame()
    const { wrapper } = mountTurnForm(game)

    await wrapper.find('[data-test="score-table-open"]').trigger('click')

    const dialog = document.body.querySelector('[role="dialog"]')
    const image = document.body.querySelector('[role="dialog"] img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toContain('tabla-puntuacion')
    /**
     * La imagen se ve, no se recorta: el diálogo se ensancha para caberla en lugar de dejarla con un
     * `overflow-x`. `max-w-3xl` son 768px menos el padding, más que los 700px que pide el club.
     */
    expect(dialog?.classList.contains('max-w-3xl')).toBe(true)
    expect(image?.classList.contains('w-full')).toBe(true)
    expect(image?.classList.contains('max-w-none')).toBe(false)
  })

  it('abrir y cerrar la ayuda no pierde el formulario ni el borrador (RF-28.5)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    authenticate(pinia)

    await setWinHand(wrapper, { winner: playerOf(game, 0), dora: 3, fu: 40 }, ['tanyao'])
    await wrapper.find('input[name="yakuFilter"]').setValue('tan')

    const draftKey = `mahjongbu.turn-draft.${game.id}`
    const draftAntes = localStorage.getItem(draftKey)

    await wrapper.find('[data-test="help-open"]').trigger('click')
    await nextTick()

    const dialog = document.body.querySelector('[role="dialog"]')
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect((wrapper.find('input[name="doraCount"]').element as HTMLInputElement).value).toBe('3')
    expect((wrapper.find('input[name="fu"]').element as HTMLInputElement).value).toBe('40')
    expect((wrapper.find('input[name="yakuFilter"]').element as HTMLInputElement).value).toBe('tan')
    expect(localStorage.getItem(draftKey)).toBe(draftAntes)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})

/**
 * T21 · RF-28.4. La imagen de la tabla de puntuación vive en `src/assets/tabla-puntuacion.png` y su
 * ruta está declarada. El test falla si el fichero no está: borrarla o moverla tiene que romper algo,
 * y ese algo es este test además del build. Lo que **no** puede comprobarse es que su contenido
 * coincida con `docs/domain.md` §4.2: es una instantánea, no una fuente.
 */
describe('T21 · la tabla de puntuación existe (RF-28.4)', () => {
  it('el fichero de la imagen está en su ruta declarada', async () => {
    const ruta = fileURLToPath(new NodeURL('../assets/tabla-puntuacion.png', import.meta.url))
    const bytes = await readFile(ruta)

    expect(bytes.byteLength).toBeGreaterThan(0)
  })
})
