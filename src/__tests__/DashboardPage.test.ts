import { RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '@/pages/DashboardPage.vue'
import { gamesRepository } from '@/data/games.repository'
import type { GameParticipant } from '@/data/games.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { toPlayerId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'

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

function mountPage(): ReturnType<typeof mount> {
  const pinia = createPinia()

  return mount(DashboardPage, {
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

function participants(): readonly GameParticipant[] {
  return ['east', 'south', 'west', 'north'].map((seat, index) => ({
    playerId: toPlayerId(`p${index + 1}`),
    seat: seat as GameParticipant['seat'],
  }))
}

describe('T85 · DashboardPage', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('muestra los accesos a todas las secciones', async () => {
    const wrapper = mountPage()

    await vi.waitFor(() =>
      expect(wrapper.findAllComponents(RouterLinkStub).length).toBeGreaterThanOrEqual(6),
    )

    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.map((link) => link.props('to'))).toEqual(
      expect.arrayContaining([
        '/',
        '/partidas',
        '/jugadores',
        '/temporadas',
        '/estadisticas',
        '/ranking',
      ]),
    )
  })

  it('resume los contadores de partidas abiertas, jugadores y temporadas', async () => {
    await gamesRepository.create({
      seasonId: null,
      date: { seconds: 1714521600, nanoseconds: 0 },
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: participants(),
    })
    await seasonsRepository.create({
      title: 'Temporada abierta',
      dateFrom: { seconds: 1711900800, nanoseconds: 0 },
      dateTo: { seconds: 1743436800, nanoseconds: 0 },
    })
    await seasonsRepository.create({
      title: 'Cerrada',
      dateFrom: { seconds: 1680480000, nanoseconds: 0 },
      dateTo: { seconds: 1711843200, nanoseconds: 0 },
      status: 'closed',
    })

    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Partidas abiertas'))
    expect(wrapper.text()).toContain('Jugadores')
    expect(wrapper.text()).toContain('Temporadas abiertas')
    expect(wrapper.text()).not.toContain('Cerrada')
  })

  it('responde en escritorio y a 360 px de ancho (RNF-4): rejilla en una columna hasta md', async () => {
    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.find('.grid.grid-cols-1').exists()).toBe(true))
    const grid = wrapper.find('.grid.grid-cols-1')
    expect(grid.classes()).toContain('md:grid-cols-3')
    expect(grid.classes()).not.toContain('min-w-full')

    for (const width of [360, 1280]) {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      })
      window.dispatchEvent(new Event('resize'))
      expect(wrapper.findAllComponents(RouterLinkStub).length).toBeGreaterThanOrEqual(1)
    }
  })
})
