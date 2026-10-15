import { RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RankingsPage from '@/pages/RankingsPage.vue'
import { createBatch } from '@/data/batch'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { rankingsRepository } from '@/data/rankings.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'
import { usePreferencesStore } from '@/stores/preferences'

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

function mountPage(pinia: ReturnType<typeof createPinia>): ReturnType<typeof mount> {
  return mount(RankingsPage, {
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

async function createPlayers(): Promise<PlayerRecord[]> {
  return Promise.all(
    ['p1', 'p2'].map((externalId) => playersRepository.create({ externalId, name: externalId })),
  )
}

/** `props('to')` es `unknown`: solo interesan los destinos que son cadenas. */
function isStringTarget(value: unknown): value is string {
  return typeof value === 'string'
}

describe('T88 · RankingsPage', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
  })

  it('exige elegir temporada antes de mostrar el ranking (RF-13.7)', async () => {
    const pinia = createPinia()
    const wrapper = mountPage(pinia)

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Elige una temporada para ver el ranking.'),
    )
    expect(wrapper.find('tbody').exists()).toBe(false)
  })

  it('muestra posición, puntos y partidas y enlaza cada jugador a sus partidas (RF-13.1, RF-13.2, RF-13.3, RF-12.5)', async () => {
    const players = await createPlayers()
    const [p1, p2] = players

    if (p1 === undefined || p2 === undefined) {
      throw new Error('faltan jugadores')
    }

    const season = await seasonsRepository.create({
      title: 'Temp 1',
      dateFrom: { seconds: 1711900800, nanoseconds: 0 },
      dateTo: { seconds: 1743436800, nanoseconds: 0 },
    })

    const batch = createBatch()
    await rankingsRepository.replaceForSeason(
      season.id,
      [
        {
          playerId: p1.id,
          playerName: 'p1',
          points: 3000,
          victories: 2,
          seconds: 1,
          rank: 1,
          gamesPlayed: 3,
        },
        {
          playerId: p2.id,
          playerName: 'p2',
          points: -1500,
          victories: 0,
          seconds: 0,
          rank: 2,
          gamesPlayed: 2,
        },
      ],
      batch,
    )
    await batch.commit()

    const pinia = createPinia()
    usePreferencesStore(pinia).setLastSeason(season.id)
    const wrapper = mountPage(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('p1'))
    expect(wrapper.text()).toContain('p2')
    expect(wrapper.text()).toContain('1.ª')
    expect(wrapper.text()).toContain('2.ª')

    const links = wrapper.findAllComponents(RouterLinkStub)
    const hrefs = links.map((link) => link.props('to')).filter(isStringTarget)
    expect(hrefs).toContain(`/partidas?season=${season.id}&player=${p1.id}`)
    expect(hrefs).toContain(`/partidas?season=${season.id}&player=${p2.id}`)
  })

  it('muestra la clasificación vacía sin errores ni datos inventados (RF-13.4)', async () => {
    const season = await seasonsRepository.create({
      title: 'Temp 1',
      dateFrom: { seconds: 1711900800, nanoseconds: 0 },
      dateTo: { seconds: 1743436800, nanoseconds: 0 },
    })

    const pinia = createPinia()
    usePreferencesStore(pinia).setLastSeason(season.id)
    const wrapper = mountPage(pinia)

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Aún no hay partidas finalizadas en esta temporada.'),
    )
  })
})
