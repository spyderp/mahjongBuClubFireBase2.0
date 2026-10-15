import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SeasonForm from '@/components/seasons/SeasonForm.vue'
import { seasonsRepository } from '@/data/seasons.repository'
import type { Timestamp as DomainTimestamp } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

function ts(date: string): DomainTimestamp {
  return { seconds: new Date(`${date}T00:00:00`).getTime() / 1000, nanoseconds: 0 }
}

function mountForm() {
  const pinia = createPinia()

  return mount(SeasonForm, {
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

async function fill(
  wrapper: ReturnType<typeof mountForm>,
  title: string,
  from: string,
  to: string,
) {
  await wrapper.find('input[name="title"]').setValue(title)
  await wrapper.find('input[name="dateFrom"]').setValue(from)
  await wrapper.find('input[name="dateTo"]').setValue(to)
}

describe('T78 · SeasonForm', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('rechaza sin título y con rango invertido', async () => {
    const wrapper = mountForm()

    await wrapper.find('input[name="title"]').setValue('   ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('La temporada necesita un nombre.')

    await fill(wrapper, 'B', '2024-02-10', '2024-02-01')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('La fecha de inicio no puede ser posterior a la de fin.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('rechaza una temporada que se solapa con otra existente', async () => {
    await seasonsRepository.create({
      title: 'Club 2024',
      dateFrom: ts('2024-01-01'),
      dateTo: ts('2024-12-31'),
    })
    const wrapper = mountForm()

    await fill(wrapper, 'Primavera', '2024-06-01', '2024-07-31')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('La temporada se solapa con «Club 2024».')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('crea una temporada válida y emite saved con el registro', async () => {
    const wrapper = mountForm()

    await fill(wrapper, '  Otoño  ', '2024-09-01', '2024-11-30')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    const record = wrapper.emitted('saved')?.[0]?.[0] as {
      title: string
      dateFrom: DomainTimestamp
      dateTo: DomainTimestamp
    }
    expect(record.title).toBe('Otoño')
    expect(record.dateFrom.seconds).toBe(ts('2024-09-01').seconds)
    expect(record.dateTo.seconds).toBe(ts('2024-11-30').seconds)
  })

  it('emite cancel al pulsar cancelar', async () => {
    const wrapper = mountForm()

    const buttons = wrapper.findAll('button')
    if (buttons[0] === undefined) {
      throw new Error('Botón cancelar no encontrado')
    }
    await buttons[0].trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('una escritura rechazada se muestra y no emite saved', async () => {
    vi.spyOn(seasonsRepository, 'create').mockRejectedValueOnce(
      new Error('Missing or insufficient permissions.'),
    )
    const wrapper = mountForm()

    await fill(wrapper, 'Otoño', '2024-09-01', '2024-11-30')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('No se pudo guardar la temporada.'))
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
