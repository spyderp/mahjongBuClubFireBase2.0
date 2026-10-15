import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TurnForm from '@/components/turns/TurnForm.vue'
import { gamesRepository } from '@/data/games.repository'
import type { GameRecord } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { turnsRepository } from '@/data/turns.repository'
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

async function setWinHand(
  wrapper: ReturnType<typeof mountTurnForm>['wrapper'],
  { winner, han, dora, fu }: { winner: PlayerId; han: number; dora: number; fu: number },
  yaku: readonly string[] = [],
): Promise<void> {
  await wrapper.find('select[name="resultType"]').setValue('tsumo')
  await wrapper.find('select[name="dealerId"]').setValue(winner)
  await wrapper.find('select[name="winnerId"]').setValue(winner)
  await wrapper.find('input[name="yakuHan"]').setValue(han)
  await wrapper.find('input[name="doraCount"]').setValue(dora)
  await wrapper.find('input[name="fu"]').setValue(fu)

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
  const counters = wrapper.findAll('fieldset')[0]

  if (counters === undefined) {
    throw new Error('no hay fieldset de contadores de riichi')
  }

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
    await wrapper.find('select[name="dealerId"]').setValue(playerOf(game, 0))

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Indica qué jugadores están en tenpai.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('rechaza una mano sin yaku real', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: east, han: 0, dora: 0, fu: 30 })

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('La mano necesita al menos un yaku real; los dora no sirven.')
  })

  it('rechaza un yaku de viento ajeno al asiento y la ronda', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: east, han: 1, dora: 0, fu: 30 }, ['seatSouth'])

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
    await setWinHand(wrapper, { winner: east, han: 1, dora: 0, fu: 25 }, ['riichi'])

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
    await wrapper.find('select[name="dealerId"]').setValue(east)
    await wrapper.find('select[name="winnerId"]').setValue(east)
    await wrapper.find('select[name="discarderId"]').setValue(south)
    await wrapper.find('input[name="yakuHan"]').setValue(1)
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
    await setWinHand(wrapper, { winner: east, han: 1, dora: 0, fu: 30 }, ['riichi'])

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
    await setWinHand(wrapper, { winner: east, han: 3, dora: 2, fu: 22 }, [
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
    const east = playerOf(game, 0)
    const south = playerOf(game, 1)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('ryuukyoku')
    await wrapper.find('select[name="dealerId"]').setValue(east)
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

  it('exige yaku, han, dora, fu y honba antes de guardar una mano (RF-3.13)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), han: 1, dora: 1, fu: 30 }, ['riichi'])
    // Un campo borrado vale 0 con `Number('')`, así que sin esto se guardaba en silencio.
    await wrapper.find('input[name="doraCount"]').setValue('')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain(
      'Indica yaku, han de yaku, dora, fu y honba antes de guardar la mano.',
    )
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('exige al menos un yaku marcado antes de guardar una mano (RF-3.13)', async () => {
    const game = await createGame()
    const { wrapper, pinia } = mountTurnForm(game)

    authenticate(pinia)
    await setWinHand(wrapper, { winner: playerOf(game, 0), han: 2, dora: 1, fu: 30 }, [])

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain(
      'Indica yaku, han de yaku, dora, fu y honba antes de guardar la mano.',
    )
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
    await wrapper.find('input[name="honba"]').setValue('3')

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
    await first.wrapper.find('select[name="dealerId"]').setValue(east)
    await first.wrapper.find('input[name="honba"]').setValue('2')

    await first.wrapper.find('form').trigger('submit')

    expect(first.wrapper.text()).toContain('Necesitas iniciar sesión para guardar el turno.')
    expect(first.wrapper.emitted('saved')).toBeUndefined()

    first.wrapper.unmount()

    const second = mountTurnForm(game)
    await nextTick()

    expect(
      (second.wrapper.find('select[name="resultType"]').element as HTMLSelectElement).value,
    ).toBe('tsumo')
    expect(
      (second.wrapper.find('select[name="dealerId"]').element as HTMLSelectElement).value,
    ).toBe(east)
    expect((second.wrapper.find('input[name="honba"]').element as HTMLInputElement).value).toBe('2')
  })

  it('rechaza la captura en sistemas de reglas sin soporte', async () => {
    const game = await createGame('mleague')
    const { wrapper, pinia } = mountTurnForm(game)
    const east = playerOf(game, 0)

    authenticate(pinia)
    await wrapper.find('select[name="resultType"]').setValue('tsumo')
    await wrapper.find('select[name="dealerId"]').setValue(east)

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Esta partida no admite captura por su sistema de reglas.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
