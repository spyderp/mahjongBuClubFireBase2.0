import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerForm from '@/components/players/PlayerForm.vue'
import { playersRepository } from '@/data/players.repository'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

function mountForm() {
  const pinia = createPinia()

  return mount(PlayerForm, {
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

async function fillInputs(wrapper: ReturnType<typeof mountForm>, name: string, externalId: string) {
  await wrapper.find('input[name="name"]').setValue(name)
  await wrapper.find('input[name="externalId"]').setValue(externalId)
}

async function submit(wrapper: ReturnType<typeof mountForm>): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())
}

describe('T77 · PlayerForm', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('rechaza nombre vacío, nombre demasiado largo e identificador inválido', async () => {
    const wrapper = mountForm()

    await wrapper.find('input[name="name"]').setValue('   ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('El nombre no puede estar vacío.')

    await wrapper.find('input[name="name"]').setValue('a'.repeat(101))
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('El nombre no puede superar los 100 caracteres.')

    await wrapper.find('input[name="name"]').setValue('Ana')
    await wrapper.find('input[name="externalId"]').setValue('soc 001')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('El identificador no cumple ningún formato admitido.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('crea un jugador válido y emite saved con el registro', async () => {
    const wrapper = mountForm()

    await fillInputs(wrapper, '  Satoshi  ', 'SOC-001')
    await submit(wrapper)

    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({
      name: 'Satoshi',
      externalId: 'soc-001',
      active: true,
    })
  })

  it('un nombre duplicado pide confirmación antes de crear', async () => {
    await playersRepository.create({ externalId: 'ana', name: 'Ana' })
    const wrapper = mountForm()

    await fillInputs(wrapper, 'ana', '')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Se creará un duplicado.'))

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ name: 'ana' })
  })

  it('un identificador duplicado pide confirmación antes de crear', async () => {
    await playersRepository.create({ externalId: 'soc-001', name: 'Ana' })
    const wrapper = mountForm()

    await fillInputs(wrapper, 'Bob', 'SOC-001')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Se creará un duplicado.'))

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeDefined())

    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ name: 'Bob', externalId: 'soc-001' })
  })

  it('edita un jugador y emite saved con el registro actualizado', async () => {
    const created = await playersRepository.create({ externalId: 'dani', name: 'Dani' })
    const pinia = createPinia()
    const wrapper = mount(PlayerForm, {
      props: { player: created },
      global: { plugins: [pinia, PiniaColada, createTestI18n()] },
    })

    await wrapper.find('input[name="name"]').setValue('Daniel')
    await submit(wrapper)

    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ name: 'Daniel' })
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

  it('un alta rechazada se muestra y no emite saved', async () => {
    vi.spyOn(playersRepository, 'create').mockRejectedValueOnce(
      new Error('Missing or insufficient permissions.'),
    )
    const wrapper = mountForm()

    await fillInputs(wrapper, 'Ana', 'SOC-002')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('No se pudo guardar el jugador.'))
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('una edición rechazada se muestra y no emite saved', async () => {
    const created = await playersRepository.create({ externalId: 'dani', name: 'Dani' })
    vi.spyOn(playersRepository, 'update').mockRejectedValueOnce(new Error('boom'))
    const pinia = createPinia()
    const wrapper = mount(PlayerForm, {
      props: { player: created },
      global: { plugins: [pinia, PiniaColada, createTestI18n()] },
    })

    await wrapper.find('input[name="name"]').setValue('Daniel')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('No se pudo guardar el jugador.'))
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
