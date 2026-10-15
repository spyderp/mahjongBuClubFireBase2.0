import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlayersPage from '@/pages/PlayersPage.vue'
import { playersRepository } from '@/data/players.repository'
import type { PlayerId } from '@/domain/types'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'
import { routerPush } from '@/test-utils/routerMock'

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

  return mount(PlayersPage, {
    props: { creating },
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

async function createPlayer(externalId: string): Promise<PlayerId> {
  const player = await playersRepository.create({ externalId, name: externalId })

  return player.id
}

function findButtons(
  wrapper: ReturnType<typeof mount>,
  label: string,
): Array<{ trigger: (event: string) => Promise<void> }> {
  const wrapperButtons = wrapper.findAll('button')
  const bodyButtons = Array.from(document.body.querySelectorAll('button'))
  const buttons = [...wrapperButtons.map((b) => b.element), ...bodyButtons]

  return buttons
    .filter((button) => button.textContent?.includes(label) === true)
    .map((button) => ({
      trigger: async (event: string) => {
        button.dispatchEvent(new MouseEvent(event, { bubbles: true }))
        await Promise.resolve()
      },
    }))
}

async function clickButton(wrapper: ReturnType<typeof mount>, label: string): Promise<void> {
  const [button] = findButtons(wrapper, label)

  if (button === undefined) {
    throw new Error(`Botón «${label}» no encontrado`)
  }

  await button.trigger('click')
}

describe('T87 · PlayersPage', () => {
  beforeEach(() => {
    fakeReset()
    routerPush.mockClear()
  })

  it('lista jugadores y conserva visible el histórico de un dado de baja (T87, RF-0.7)', async () => {
    const activeId = await createPlayer('p1')
    const retiredId = await createPlayer('p2')
    await playersRepository.update(retiredId, { active: false })

    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('p1'))
    expect(wrapper.text()).toContain('p2')
    expect(wrapper.text()).toContain('Activo')
    expect(wrapper.text()).toContain('Retirado')
    expect(activeId.length).toBeGreaterThan(0)
  })

  it('en modo crear muestra PlayerForm y navega a la lista tras guardar', async () => {
    const wrapper = mountPage(true)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Nuevo jugador'))
    await wrapper.find('input[name="name"]').setValue('Piko')
    await wrapper.find('input[name="externalId"]').setValue('P-1')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith('/jugadores'))
  })

  it('da de baja a un jugador con confirmación y pasa a Retirado (RF-0.7, RF-1.3)', async () => {
    await createPlayer('p1')
    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Dar de baja'))
    await clickButton(wrapper, 'Dar de baja')

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('¿Dar de baja a «p1»? Su histórico se conservará.')
    expect(wrapper.text()).toContain('Activo')

    await clickButton(wrapper, 'Confirmar')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Retirado'))
    expect(wrapper.text()).toContain('p1')
  })

  it('muestra mensaje cuando no hay jugadores', async () => {
    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Aún no hay jugadores.'))
  })
})
