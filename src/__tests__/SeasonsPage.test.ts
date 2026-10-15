import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SeasonsPage from '@/pages/SeasonsPage.vue'
import { seasonsRepository } from '@/data/seasons.repository'
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

  return mount(SeasonsPage, {
    props: { creating },
    global: { plugins: [pinia, PiniaColada, createTestI18n()] },
  })
}

async function createSeason(title: string, status: 'open' | 'closed' = 'open'): Promise<string> {
  const season = await seasonsRepository.create({
    title,
    dateFrom: { seconds: 1711900800, nanoseconds: 0 },
    dateTo: { seconds: 1743436800, nanoseconds: 0 },
    status,
  })

  return season.id
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

describe('T87 · SeasonsPage', () => {
  beforeEach(() => {
    fakeReset()
    routerPush.mockClear()
  })

  it('lista temporadas con su estado y la cerrada no ofrece cerrarla (RF-11.x)', async () => {
    await createSeason('Abierta')
    await createSeason('Cerrada', 'closed')

    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Abierta'))
    expect(wrapper.text()).toContain('Cerrada')
    expect(wrapper.text()).toContain('Temporada abierta')
    expect(wrapper.text()).toContain('Temporada cerrada')

    const closeButtons = wrapper
      .findAll('button')
      .filter((candidate) => candidate.text().includes('Cerrar temporada'))
    expect(closeButtons).toHaveLength(1)
  })

  it('en modo crear muestra SeasonForm y navega a la lista tras guardar', async () => {
    const wrapper = mountPage(true)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Nueva temporada'))
    await wrapper.find('input[name="title"]').setValue('Verano 2024')
    await wrapper.find('input[name="dateFrom"]').setValue('2024-04-01')
    await wrapper.find('input[name="dateTo"]').setValue('2025-03-31')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith('/temporadas'))
  })

  it('cierra una temporada con confirmación (RF-0.5)', async () => {
    await createSeason('Abierta')
    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Cerrar temporada'))
    await clickButton(wrapper, 'Cerrar temporada')

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain(
      '¿Cerrar la temporada «Abierta»? No admitirá más partidas.',
    )
    expect(wrapper.text()).toContain('Temporada abierta')

    await clickButton(wrapper, 'Confirmar')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Temporada cerrada'))
  })

  it('muestra mensaje cuando no hay temporadas', async () => {
    const wrapper = mountPage()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Aún no hay temporadas.'))
  })
})
