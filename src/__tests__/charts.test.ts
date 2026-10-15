import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PointsEvolutionChart from '@/components/charts/PointsEvolutionChart.vue'
import PositionsChart from '@/components/charts/PositionsChart.vue'
import YakuChart from '@/components/charts/YakuChart.vue'

const chartMock = vi.hoisted(() => ({
  instances: [] as Array<{ config: unknown; destroy: () => void }>,
}))

vi.mock('chart.js/auto', () => {
  class Chart {
    destroy: () => void

    constructor(_element: unknown, config: unknown) {
      this.destroy = vi.fn()
      chartMock.instances.push({ config, destroy: this.destroy })
    }
  }

  return { default: Chart }
})

interface Dataset {
  readonly data: readonly number[]
  readonly label?: string
}

interface ChartConfigShape {
  readonly type: string
  readonly data: { labels: readonly number[] | readonly string[]; datasets: readonly Dataset[] }
}

function configOf(instance: (typeof chartMock.instances)[number]): ChartConfigShape {
  return instance.config as ChartConfigShape
}

function destroyOf(instance: (typeof chartMock.instances)[number]): ReturnType<typeof vi.fn> {
  return instance.destroy as ReturnType<typeof vi.fn>
}

describe('T82+T83 · Gráficas', () => {
  beforeEach(() => {
    chartMock.instances.length = 0
  })

  it('PointsEvolutionChart dibuja la serie recibida por props y destruye la instancia al desmontar', () => {
    const series = [
      { label: 'Este', points: [25000, 27400, 26200] as const },
      { label: 'Sur', points: [25000, 23000, 23600] as const },
    ]

    const wrapper = mount(PointsEvolutionChart, {
      props: { title: 'Evolución de puntos', series },
    })

    expect(chartMock.instances).toHaveLength(1)
    const instance = chartMock.instances[0]
    if (instance === undefined) {
      throw new Error('no se creó el gráfico')
    }

    const config = configOf(instance)
    expect(config.type).toBe('line')
    expect(config.data.labels).toEqual([1, 2, 3])
    expect(config.data.datasets[0]?.data).toEqual([25000, 27400, 26200])
    expect(config.data.datasets[1]?.data).toEqual([25000, 23000, 23600])
    expect(config.data.datasets[0]?.label).toBe('Este')

    wrapper.unmount()

    expect(destroyOf(instance)).toHaveBeenCalledOnce()
  })

  it('PositionsChart dibuja el desglose de posiciones recibido y destruye la instancia al desmontar', () => {
    const positions = [
      { label: '1.ª', count: 3 },
      { label: '2.ª', count: 5 },
      { label: '3.ª', count: 1 },
      { label: '4.ª', count: 1 },
    ]

    const wrapper = mount(PositionsChart, {
      props: { title: 'Posiciones', positions },
    })

    expect(chartMock.instances).toHaveLength(1)
    const instance = chartMock.instances[0]
    if (instance === undefined) {
      throw new Error('no se creó el gráfico')
    }

    const config = configOf(instance)
    expect(config.type).toBe('doughnut')
    expect(config.data.labels).toEqual(['1.ª', '2.ª', '3.ª', '4.ª'])
    expect(config.data.datasets[0]?.data).toEqual([3, 5, 1, 1])

    wrapper.unmount()

    expect(destroyOf(instance)).toHaveBeenCalledOnce()
  })

  it('YakuChart dibuja la misma cifra que mostraría la tabla de estadísticas', () => {
    const yaku = [
      { label: 'Riichi', count: 12 },
      { label: 'Tanyao', count: 7 },
      { label: 'Tenhou', count: 1 },
    ]

    const wrapper = mount(YakuChart, {
      props: { title: 'Yaku más repetidos', yaku },
    })

    expect(chartMock.instances).toHaveLength(1)
    const instance = chartMock.instances[0]
    if (instance === undefined) {
      throw new Error('no se creó el gráfico')
    }

    const config = configOf(instance)
    expect(config.type).toBe('bar')
    expect(config.data.labels).toEqual(['Riichi', 'Tanyao', 'Tenhou'])
    expect(config.data.datasets[0]?.data).toEqual([12, 7, 1])

    wrapper.unmount()

    expect(destroyOf(instance)).toHaveBeenCalledOnce()
  })
})
