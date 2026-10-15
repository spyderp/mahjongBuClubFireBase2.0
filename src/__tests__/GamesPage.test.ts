import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GamesPage from '@/pages/GamesPage.vue'
import { gamesRepository } from '@/data/games.repository'
import type { GameParticipant } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'
import { routerPush, setMockRoute } from '@/test-utils/routerMock'

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

function mountPage(creating = false): ReturnType<typeof mount> {
  const pinia = createPinia()

  return mount(GamesPage, {
    props: { creating },
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

function participantsOf(players: readonly PlayerRecord[]): readonly GameParticipant[] {
  return ['east', 'south', 'west', 'north'].map((seat, index) => {
    const player = players[index]
    if (player === undefined) {
      throw new Error('faltan jugadores')
    }

    return { playerId: player.id, seat: seat as GameParticipant['seat'] }
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
  wrapper: ReturnType<typeof mountPage>,
  byId: readonly (string | undefined)[],
): Promise<void> {
  for (const [index, seat] of ['east', 'south', 'west', 'north'].entries()) {
    await wrapper.find(`select[name="seat-${seat}"]`).setValue(byId[index] ?? '')
  }
}

describe('T86 · GamesPage', () => {
  beforeEach(() => {
    fakeReset()
    setMockRoute({})
    routerPush.mockClear()
  })

  it('lista las partidas abiertas y navega al detalle al seleccionar una', async () => {
    const players = await createFourPlayers()
    const game = await gamesRepository.create({
      seasonId: null,
      date: { seconds: 1714521600, nanoseconds: 0 },
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: participantsOf(players),
    })

    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('p1'))
    const cell = wrapper.findAll('tbody tr')[0]
    if (cell === undefined) {
      throw new Error('fila de partida no encontrada')
    }
    await cell.trigger('click')

    expect(routerPush).toHaveBeenCalledWith(`/partidas/${game.id}`)
  })

  it('en modo crear muestra GameForm y navega al detalle al guardar', async () => {
    const players = await createFourPlayers()
    const wrapper = mountPage(true)

    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    expect(wrapper.text()).toContain('Nueva partida')

    await wrapper.find('input[type="date"]').setValue('2024-05-01')
    await wrapper.find('select[name="length"]').setValue('tonpuusen')
    await selectSeats(
      wrapper,
      players.map((player) => player.id),
    )
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(routerPush).toHaveBeenCalled())
    const target = routerPush.mock.calls[0]?.[0]
    expect(String(target)).toMatch(/^\/partidas\//)
  })

  it('filtra por temporada y jugador cuando llega por la URL (RF-12.5)', async () => {
    const players = await createFourPlayers()
    const [p1, p2, p3, p4] = players

    if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined) {
      throw new Error('faltan jugadores')
    }

    const season = await seasonsRepository.create({
      title: 'Temp 1',
      dateFrom: { seconds: 1711900800, nanoseconds: 0 },
      dateTo: { seconds: 1743436800, nanoseconds: 0 },
    })

    const gameA = await gamesRepository.create({
      seasonId: season.id,
      date: { seconds: 1714521600, nanoseconds: 0 },
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: [
        { playerId: p1.id, seat: 'east' },
        { playerId: p4.id, seat: 'north' },
      ],
    })
    await gamesRepository.create({
      seasonId: season.id,
      date: { seconds: 1714608000, nanoseconds: 0 },
      gameLength: 'hanchan',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: [
        { playerId: p2.id, seat: 'south' },
        { playerId: p3.id, seat: 'west' },
      ],
    })

    setMockRoute({ query: { season: season.id, player: p1.id } })
    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('p4'))
    expect(wrapper.text()).toContain('p1')
    expect(wrapper.text()).not.toContain('p2')

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (row === undefined) {
      throw new Error('fila de partida no encontrada')
    }
    await row.trigger('click')

    expect(routerPush).toHaveBeenCalledWith(`/partidas/${gameA.id}`)
  })

  it('muestra mensaje cuando no hay partidas abiertas', async () => {
    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('No hay partidas abiertas'))
  })
})
