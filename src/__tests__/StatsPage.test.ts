import { RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StatsPage from '@/pages/StatsPage.vue'
import { createBatch } from '@/data/batch'
import { gamesRepository } from '@/data/games.repository'
import type { GameParticipant, GameResultDoc } from '@/data/games.repository'
import { playersRepository } from '@/data/players.repository'
import type { PlayerRecord } from '@/data/players.repository'
import { playerSeasonStatsRepository } from '@/data/playerSeasonStats.repository'
import { seasonsRepository } from '@/data/seasons.repository'
import type { PlayerSeasonStats, StatsGame } from '@/domain/stats'
import { recalculate } from '@/domain/stats/recalculate'
import type { SeasonId } from '@/domain/types'
import { doc, fakeGetDb, fakeReset, writeBatch } from '@/test-utils/fakeFirestore'
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

interface ChartConfigShape {
  readonly type: string
  readonly data: {
    readonly datasets: readonly { readonly label?: string; readonly data?: readonly number[] }[]
  }
}

const chartMock = vi.hoisted(() => ({
  instances: [] as Array<{ config: ChartConfigShape }>,
}))

vi.mock('chart.js/auto', () => {
  class Chart {
    constructor(_element: unknown, config: ChartConfigShape) {
      chartMock.instances.push({ config })
    }
  }

  return { default: Chart }
})

function mountPage(pinia: ReturnType<typeof createPinia>): ReturnType<typeof mount> {
  return mount(StatsPage, {
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

function noStats(): PlayerSeasonStats {
  return {
    playerId: '' as never,
    seasonId: '' as never,
    actualPoints: 0,
    gamesPlayed: 0,
    victories: 0,
    positions: { '1st': 0, '2nd': 0, '3rd': 0, '4th': 0 },
    yakuStats: {
      riichi: 0,
      dora: 0,
      kan: 0,
      tsumo: 0,
      ron: 0,
      chombo: 0,
      haiteiRaoyue: 0,
      rinshanKaihou: 0,
      yakuman: 0,
    },
  }
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

function participantsOf(players: readonly PlayerRecord[]): readonly GameParticipant[] {
  return ['east', 'south', 'west', 'north'].map((seat, index) => {
    const player = players[index % players.length]

    if (player === undefined) {
      throw new Error('faltan jugadores')
    }

    return { playerId: player.id, seat: seat as GameParticipant['seat'] }
  })
}

/**
 * RF-17.4: los documentos de resultados que se escriben en `games/{id}` y los que consume
 * `recalculate` son el mismo dato con dos formas. Si divergieran, el test de la invariante
 * estaría comparando dos mentiras.
 */
type ResultSeed = {
  readonly player: PlayerRecord
  readonly seat: GameParticipant['seat']
  readonly finalScore: number
  readonly finalPosition: '1st' | '2nd' | '3rd' | '4th'
  readonly uma: number
}

function resultDocs(seeds: readonly ResultSeed[]): readonly GameResultDoc[] {
  return seeds.map((seed) => ({
    playerId: seed.player.id,
    playerName: seed.player.name,
    seat: seed.seat,
    finalScore: seed.finalScore,
    finalPosition: seed.finalPosition,
    uma: seed.uma,
    chombo: false,
    bankrupt: false,
  }))
}

function toStatsGame(
  gameId: string,
  seasonId: SeasonId,
  results: readonly GameResultDoc[],
): StatsGame {
  return {
    gameId: gameId as StatsGame['gameId'],
    seasonId,
    status: 'finalized',
    results: results.map((doc) => ({
      playerId: doc.playerId,
      playerName: doc.playerName,
      seat: doc.seat,
      score: doc.finalScore - doc.uma,
      chombo: doc.chombo,
      bankrupt: doc.bankrupt,
      position: doc.finalPosition,
      uma: doc.uma,
      finalScore: doc.finalScore,
    })),
    hands: [],
  }
}

describe('T88 · StatsPage', () => {
  beforeEach(() => {
    fakeReset()
    localStorage.clear()
    chartMock.instances.length = 0
  })

  it('exige elegir temporada antes de mostrar cifras (RF-13.7)', async () => {
    const pinia = createPinia()
    const wrapper = mountPage(pinia)

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Elige una temporada para ver estadísticas.'),
    )
    expect(chartMock.instances).toHaveLength(0)
    expect(wrapper.find('tbody').exists()).toBe(false)
  })

  it('muestra partidas, victorias y puntos de cada jugador y enlaza a las partidas que las componen (RF-12.1 a RF-12.8)', async () => {
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

    const game = await gamesRepository.create({
      seasonId: season.id,
      date: { seconds: 1714521600, nanoseconds: 0 },
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: participantsOf(players),
    })

    const changes = writeBatch(fakeGetDb())
    changes.update(doc(fakeGetDb(), 'games', game.id), {
      status: 'finalized',
      results: [
        {
          playerId: p1.id,
          playerName: 'p1',
          seat: 'east',
          finalScore: 27600,
          finalPosition: '1st',
          uma: 3000,
          chombo: false,
          bankrupt: false,
        },
      ],
    })

    const stats = createBatch()
    await playerSeasonStatsRepository.replaceForSeason(
      season.id,
      [
        {
          playerId: p1.id,
          seasonId: season.id,
          actualPoints: 27600,
          gamesPlayed: 1,
          victories: 1,
          positions: { '1st': 1, '2nd': 0, '3rd': 0, '4th': 0 },
          yakuStats: {
            riichi: 5,
            dora: 9,
            kan: 1,
            tsumo: 2,
            ron: 1,
            chombo: 0,
            haiteiRaoyue: 1,
            rinshanKaihou: 0,
            yakuman: 0,
          },
        },
        {
          playerId: p2.id,
          seasonId: season.id,
          actualPoints: -3000,
          gamesPlayed: 1,
          victories: 0,
          positions: { '1st': 0, '2nd': 0, '3rd': 1, '4th': 0 },
          yakuStats: {
            ...noStats().yakuStats,
          },
        },
      ],
      stats,
    )
    await Promise.all([changes.commit(), stats.commit()])

    const pinia = createPinia()
    usePreferencesStore(pinia).setLastSeason(season.id)
    const wrapper = mountPage(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('p1'))
    expect(wrapper.text()).toContain('p2')

    const links = wrapper.findAllComponents(RouterLinkStub)
    const hrefs = links.map((link) => link.props('to')).filter(isStringTarget)
    expect(hrefs).toContain(`/partidas?season=${season.id}&player=${p1.id}`)
    expect(hrefs).toContain(`/partidas?season=${season.id}&player=${p2.id}`)

    const types = chartMock.instances.map((instance) => instance.config.type)
    expect(types).toContain('line')
    expect(types).toContain('doughnut')
    expect(types).toContain('bar')

    const line = chartMock.instances.find((instance) => instance.config.type === 'line')
    const datasets = line?.config.data.datasets ?? []
    expect(datasets[0]?.label).toBe('p1')
    expect(datasets[0]?.data).toEqual([27600])
  })

  it('muestra mensaje cuando una temporada aún no tiene estadísticas (RF-12.7)', async () => {
    const season = await seasonsRepository.create({
      title: 'Temp 1',
      dateFrom: { seconds: 1711900800, nanoseconds: 0 },
      dateTo: { seconds: 1743436800, nanoseconds: 0 },
    })

    const pinia = createPinia()
    usePreferencesStore(pinia).setLastSeason(season.id)

    const wrapper = mountPage(pinia)
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Aún no hay estadísticas en esta temporada.'),
    )
  })

  /**
   * RF-17.4 y RF-17.5: la gráfica de evolución y la tabla de la página se construyen con los
   * mismos datos, así que el último punto dibujado de cada jugador tiene que ser exactamente la
   * cifra que la tabla muestra. Aquí los documentos derivados no se escriben a mano: los produce
   * `recalculate` desde los mismos `games` que alimentan la serie, que es el pipeline real.
   */
  it('el último punto de cada serie coincide con los puntos de la tabla (RF-17.4, RF-17.5)', async () => {
    const players = await Promise.all(
      ['p1', 'p2', 'p3', 'p4'].map((externalId) =>
        playersRepository.create({ externalId, name: externalId }),
      ),
    )
    const [p1, p2, p3, p4] = players

    if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined) {
      throw new Error('faltan jugadores')
    }

    const season = await seasonsRepository.create({
      title: 'Temp 1',
      dateFrom: { seconds: 1711900800, nanoseconds: 0 },
      dateTo: { seconds: 1743436800, nanoseconds: 0 },
    })

    const first = await gamesRepository.create({
      seasonId: season.id,
      date: { seconds: 1714521600, nanoseconds: 0 },
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: participantsOf(players),
    })
    const second = await gamesRepository.create({
      seasonId: season.id,
      date: { seconds: 1714608000, nanoseconds: 0 },
      gameLength: 'tonpuusen',
      ruleset: 'mahjongSouls',
      rulesetVersion: '1.0',
      startPoints: 25000,
      players: participantsOf(players),
    })

    const firstResults = resultDocs([
      { player: p1, seat: 'east', finalScore: 30030, finalPosition: '1st', uma: 30 },
      { player: p2, seat: 'south', finalScore: 22010, finalPosition: '2nd', uma: 10 },
      { player: p3, seat: 'west', finalScore: 22990, finalPosition: '3rd', uma: -10 },
      { player: p4, seat: 'north', finalScore: 24970, finalPosition: '4th', uma: -30 },
    ])
    const secondResults = resultDocs([
      { player: p1, seat: 'east', finalScore: 24010, finalPosition: '2nd', uma: 10 },
      { player: p2, seat: 'south', finalScore: 31030, finalPosition: '1st', uma: 30 },
      { player: p3, seat: 'west', finalScore: 21990, finalPosition: '3rd', uma: -10 },
      { player: p4, seat: 'north', finalScore: 22970, finalPosition: '4th', uma: -30 },
    ])

    const changes = writeBatch(fakeGetDb())
    changes.update(doc(fakeGetDb(), 'games', first.id), {
      status: 'finalized',
      results: firstResults,
    })
    changes.update(doc(fakeGetDb(), 'games', second.id), {
      status: 'finalized',
      results: secondResults,
    })

    const statsGames = [
      toStatsGame(first.id, season.id, firstResults),
      toStatsGame(second.id, season.id, secondResults),
    ]
    const { stats } = recalculate(season.id, statsGames)

    const derived = createBatch()
    await playerSeasonStatsRepository.replaceForSeason(season.id, stats, derived)
    await Promise.all([changes.commit(), derived.commit()])

    const pinia = createPinia()
    usePreferencesStore(pinia).setLastSeason(season.id)
    const wrapper = mountPage(pinia)

    await vi.waitFor(() => expect(wrapper.text()).toContain('p1'))

    const line = chartMock.instances.find((instance) => instance.config.type === 'line')
    const datasets = line?.config.data.datasets ?? []

    expect(datasets).toHaveLength(4)

    for (const seed of [
      { player: p1, expected: [30030, 54040] },
      { player: p2, expected: [22010, 53040] },
      { player: p3, expected: [22990, 44980] },
      { player: p4, expected: [24970, 47940] },
    ]) {
      const dataset = datasets.find((candidate) => candidate.label === seed.player.name)
      expect(dataset?.data).toEqual(seed.expected)

      const tablePoints = stats.find((entry) => entry.playerId === seed.player.id)?.actualPoints
      expect(tablePoints).toBe(seed.expected.at(-1))
      expect(wrapper.text()).toContain(String(tablePoints))
    }
  })
})
