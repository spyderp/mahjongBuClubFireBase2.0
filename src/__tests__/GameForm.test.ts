import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameForm from '@/components/games/GameForm.vue'
import { gamesRepository } from '@/data/games.repository'
import type { GameParticipant } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

function mountForm() {
  const pinia = createPinia()

  return mount(GameForm, {
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

async function createFourPlayers(): Promise<PlayerRecord[]> {
  return Promise.all(
    ['p1', 'p2', 'p3', 'p4'].map((externalId) =>
      playersRepository.create({ externalId, name: externalId }),
    ),
  )
}

async function selectSeats(
  wrapper: ReturnType<typeof mountForm>,
  byId: readonly (string | undefined)[],
): Promise<void> {
  for (const [index, seat] of ['east', 'south', 'west', 'north'].entries()) {
    await wrapper.find(`select[name="seat-${seat}"]`).setValue(byId[index] ?? '')
  }
}

describe('T79 · GameForm', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('exige fecha, longitud y cuatro asientos distintos', async () => {
    await createFourPlayers()
    const wrapper = mountForm()

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('La partida necesita una fecha.')
    expect(wrapper.text()).toContain('Elige la longitud de la partida.')
    expect(wrapper.text()).toContain('Hacen falta exactamente cuatro jugadores distintos.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('rechaza repetir un jugador en dos asientos', async () => {
    const players = await createFourPlayers()
    const [p1, p2, p3, p4] = players

    if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined) {
      throw new Error('faltan jugadores')
    }

    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('hanchan')
    await selectSeats(wrapper, [p1.id, p1.id, p3.id, p4.id])
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Cada jugador debe ocupar un único asiento.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('crea una partida válida y emite saved con la mesa completa', async () => {
    const players = await createFourPlayers()
    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('hanchan')
    await selectSeats(
      wrapper,
      players.map((player) => player.id),
    )
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      gameLength: string
      players: readonly GameParticipant[]
      date: { seconds: number }
    }
    expect(record.gameLength).toBe('hanchan')
    expect(record.date.seconds).toBe(new Date('2024-05-01T00:00:00').getTime() / 1000)
    expect(record.players.map((player) => player.seat)).toEqual(['east', 'south', 'west', 'north'])
    expect(record.players.every((player) => player.playerId.length > 0)).toBe(true)
  })

  it('crea un invitado para un participante no dado de alta (RF-1.3, RF-2.3)', async () => {
    const players = await createFourPlayers()
    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('hanchan')
    await selectSeats(wrapper, [players[0]?.id, players[1]?.id, players[2]?.id, '__guest__'])
    await wrapper.find('input[name="guest-name-north"]').setValue('Invitada')
    await wrapper.find('input[name="guest-external-id-north"]').setValue('INV-01')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const guest = await playersRepository.findByExternalId('inv-01')
    expect(guest).not.toBeNull()
    expect(guest?.guest).toBe(true)
    expect(guest?.name).toBe('Invitada')

    const record = wrapper.emitted('saved')?.[0]?.[0] as { players: readonly GameParticipant[] }
    expect(record.players.find((player) => player.seat === 'north')?.playerId).toBe(guest?.id)
  })

  it('reutiliza el invitado que ya existe en vez de duplicarlo (RF-1.4)', async () => {
    const existing = await playersRepository.create({
      externalId: 'inv-01',
      name: 'Invitado',
      guest: true,
    })
    const players = await createFourPlayers()
    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('hanchan')
    await selectSeats(wrapper, [players[0]?.id, players[1]?.id, players[2]?.id, '__guest__'])
    await wrapper.find('input[name="guest-name-north"]').setValue('Invitado')
    await wrapper.find('input[name="guest-external-id-north"]').setValue('INV-01')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as { players: readonly GameParticipant[] }
    expect(record.players.find((player) => player.seat === 'north')?.playerId).toBe(existing.id)
    expect(await playersRepository.list()).toHaveLength(5)
  })

  it('exige nombre e identificador válido al invitar (RF-1.3, RF-1.10)', async () => {
    const players = await createFourPlayers()
    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('hanchan')
    await selectSeats(wrapper, [players[0]?.id, players[1]?.id, players[2]?.id, '__guest__'])
    await wrapper.find('input[name="guest-name-north"]').setValue('')
    await wrapper.find('input[name="guest-external-id-north"]').setValue('x')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[data-test="guest-error"]').text()).toBe('El nombre no puede estar vacío.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('avisa (sin bloquear) cuando un jugador ya está en otra partida abierta', async () => {
    const players = await createFourPlayers()
    const [p1, p2, p3, p4] = players

    if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined) {
      throw new Error('faltan jugadores')
    }

    const participants: readonly GameParticipant[] = [
      { playerId: p1.id, seat: 'east' },
      { playerId: p2.id, seat: 'south' },
      { playerId: p3.id, seat: 'west' },
      { playerId: p4.id, seat: 'north' },
    ]

    await gamesRepository.create({
      seasonId: null,
      date: { seconds: Date.now() / 1000, nanoseconds: 0 },
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: participants,
    })

    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('tonpuusen')
    await selectSeats(
      wrapper,
      players.map((player) => player.id),
    )
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Jugadores ya presentes en otra partida abierta:')
    expect(wrapper.text()).toContain('p1')

    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('rechaza crear una partida en una temporada cerrada (RF-11.5)', async () => {
    const players = await createFourPlayers()
    await seasonsRepository.create({
      title: 'Campeonato de invierno',
      dateFrom: { seconds: 1711900800, nanoseconds: 0 },
      dateTo: { seconds: 1743436800, nanoseconds: 0 },
      status: 'closed',
    })

    const wrapper = mountForm()
    await vi.waitFor(async () => {
      const stored = await seasonsRepository.list()
      expect(stored).toHaveLength(1)
    })

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('tonpuusen')
    await selectSeats(
      wrapper,
      players.map((player) => player.id),
    )
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('La temporada «Campeonato de invierno» está cerrada.'),
    )

    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('emite cancel al pulsar cancelar', async () => {
    const wrapper = mountForm()

    const buttons = wrapper.findAll('button')
    if (buttons[0] === undefined) {
      throw new Error('Botón cancelar no encontrado')
    }
    await buttons[0].trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  /**
   * El fallo que costó una tarde de diagnóstico: `mutateAsync` sin `try/catch` devolvía una
   * promesa rechazada que nadie pintaba, así que una escritura denegada por las reglas era
   * indistinguible de un guardado correcto. Con la sesión caducada o sin conexión, el jugador
   * veía que no pasaba nada.
   */
  it('una escritura rechazada se muestra y no emite saved', async () => {
    const players = await createFourPlayers()
    vi.spyOn(gamesRepository, 'create').mockRejectedValueOnce(
      new Error('Missing or insufficient permissions.'),
    )
    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('tonpuusen')
    await selectSeats(
      wrapper,
      players.map((player) => player.id),
    )
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('No se pudo guardar la partida.'))
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('un aviso anterior de escritura se limpia al reintentar con datos válidos', async () => {
    const players = await createFourPlayers()
    const create = vi.spyOn(gamesRepository, 'create').mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountForm()

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('tonpuusen')
    await selectSeats(
      wrapper,
      players.map((player) => player.id),
    )
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('No se pudo guardar la partida.'))

    create.mockRestore()
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())
    expect(wrapper.text()).not.toContain('No se pudo guardar la partida.')
  })
})
