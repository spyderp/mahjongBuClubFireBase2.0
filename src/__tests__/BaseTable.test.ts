import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseTable from '@/components/ui/BaseTable.vue'
import { createTestI18n } from '@/test-utils/i18n'

interface Row {
  readonly jugador: string
  readonly puntos: number
  readonly fecha: Date
  readonly estado: string
}

const ROWS: readonly Row[] = [
  {
    jugador: 'Ana',
    puntos: 24000,
    fecha: new Date(Date.UTC(2024, 0, 2, 12, 0)),
    estado: 'cerrada',
  },
]

const COLUMNS = [
  { key: 'jugador', header: 'Jugador' },
  { key: 'puntos', header: 'Puntos', align: 'end' },
  { key: 'fecha', header: 'Fecha' },
  { key: 'estado', header: 'Estado' },
] as const

function host(
  extra: Record<string, unknown> = {},
  template = '<BaseTable :columns="columns" :rows="rows" empty-message="Sin datos"/>',
) {
  const wrapper = mount(
    defineComponent({
      components: { BaseTable },
      setup() {
        return { columns: COLUMNS, rows: ROWS, ...extra }
      },
      template,
    }),
    { global: { plugins: [createTestI18n()] } },
  )

  return wrapper
}

describe('T75 · BaseTable', () => {
  it('renderiza encabezados y celdas con formato según el tipo', () => {
    const wrapper = host()
    const headers = wrapper.findAll('th').map((cell) => cell.text())

    expect(headers).toEqual(['Jugador', 'Puntos', 'Fecha', 'Estado'])
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('24.000')
    expect(wrapper.text()).toContain('02/01/2024')
    expect(wrapper.text()).toContain('cerrada')
  })

  it('aligna a la derecha las columnas «end»', () => {
    const wrapper = host()
    const pointsHeader = wrapper.findAll('th')[1]
    const pointsCell = wrapper.findAll('td')[1]

    expect(pointsHeader?.classes()).toContain('text-end')
    expect(pointsCell?.classes()).toContain('text-end')
  })

  it('emite rowClick con toda la fila al pulsarla', async () => {
    const captured: { row?: Row } = {}
    const wrapper = host(
      { onRow: (row: Row) => void (captured.row = row) },
      '<BaseTable :columns="columns" :rows="rows" @row-click="onRow"/>',
    )

    await wrapper.find('tbody tr').trigger('click')

    expect(captured.row).toEqual(ROWS[0])
  })

  it('muestra el mensaje de vacío cuando no hay filas', () => {
    const wrapper = mount(
      defineComponent({
        components: { BaseTable },
        setup() {
          return { columns: COLUMNS }
        },
        template: '<BaseTable :columns="columns" :rows="[]" empty-message="Sin datos"/>',
      }),
      { global: { plugins: [createTestI18n()] } },
    )

    expect(wrapper.text()).toContain('Sin datos')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  })
})
