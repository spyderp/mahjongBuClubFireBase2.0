import { mount } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Pinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '@/components/layout/AppShell.vue'
import { useSessionStore } from '@/stores/session'
import { createTestI18n } from '@/test-utils/i18n'

const { signOutSession } = vi.hoisted(() => ({
  signOutSession: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/app/firebase', () => ({
  signOutSession,
  watchAuthState: vi.fn(() => () => undefined),
}))

let pinia: Pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

function mountShell() {
  return mount(AppShell, {
    global: {
      plugins: [pinia, createTestI18n()],
      stubs: { RouterLink: RouterLinkStub },
    },
    slots: { default: '<p>Contenido</p>' },
  })
}

describe('T76 · AppShell, AppHeader y AppNav', () => {
  it('AppShell envuelve el contenido con cabecera y zona principal', () => {
    const wrapper = mountShell()

    expect(wrapper.text()).toContain('Contenido')
    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.find('main').exists()).toBe(true)
    expect(wrapper.find('header').text()).toContain('MahjongBu Club')
  })

  it('AppNav muestra los enlaces generales y las capturas con sesión activa', () => {
    const session = useSessionStore()
    session.status = 'authenticated'
    session.user = {
      id: 'uid-1',
      email: 'ana@correo.es',
      displayName: 'Ana',
      photoURL: null,
    }

    const wrapper = mountShell()
    const links = wrapper.find('nav').findAllComponents(RouterLinkStub) as {
      props: (name: string) => unknown
    }[]

    const targets = links.map((link) => link.props('to'))

    expect(targets).toEqual([
      '/',
      '/partidas',
      '/jugadores',
      '/temporadas',
      '/estadisticas',
      '/ranking',
      '/partidas/nueva',
      '/jugadores/nuevo',
      '/temporadas/nueva',
    ])
  })

  it('AppNav oculta las capturas sin sesión', () => {
    const session = useSessionStore()
    session.status = 'anonymous'

    const wrapper = mountShell()
    const targets = (
      wrapper.find('nav').findAllComponents(RouterLinkStub) as {
        props: (name: string) => unknown
      }[]
    ).map((link) => link.props('to'))

    expect(targets).toEqual([
      '/',
      '/partidas',
      '/jugadores',
      '/temporadas',
      '/estadisticas',
      '/ranking',
    ])
    expect(targets).not.toContain('/partidas/nueva')
  })

  it('AppHeader muestra el nombre de usuario y permite cerrar sesión', async () => {
    const session = useSessionStore()
    session.status = 'authenticated'
    session.user = {
      id: 'uid-1',
      email: 'ana@correo.es',
      displayName: 'Ana',
      photoURL: null,
    }

    const wrapper = mountShell()
    const header = wrapper.find('header')

    expect(header.text()).toContain('Ana')
    expect(header.text()).not.toContain('ana@correo.es')
    expect(header.text()).not.toContain('uid-1')

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const signOutButtons = header.findAllComponents({ name: 'BaseButton' })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const signOutButton = signOutButtons.find((btn: { text: () => string }) =>
      btn.text().includes('Cerrar sesión'),
    )
    expect(signOutButton).toBeDefined()
    if (signOutButton) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await signOutButton.trigger('click')
    }
    expect(signOutSession).toHaveBeenCalledTimes(1)
  })

  it('AppHeader ofrece iniciar sesión cuando no hay sesión activa', () => {
    const session = useSessionStore()
    session.status = 'anonymous'

    const wrapper = mountShell()
    const header = wrapper.find('header')

    expect(header.text()).toContain('Iniciar sesión')
    expect(header.find('button').exists()).toBe(false)
  })

  /**
   * T102 · RF-15.9: una cuenta creada con correo y contraseña llega de Firebase sin `displayName`,
   * así que la cabecera se quedaba vacía. Se muestra una etiqueta neutra y nunca el correo ni el
   * identificador, que RNF-7 prohíbe exponer.
   */
  it('AppHeader con sesión sin displayName muestra una etiqueta neutra, no el correo (RNF-7)', () => {
    const session = useSessionStore()
    session.status = 'authenticated'
    session.user = { id: 'uid-9', email: 'ana@correo.es', displayName: null, photoURL: null }

    const wrapper = mountShell()
    const header = wrapper.find('header')

    expect(header.text()).toContain('Sesión iniciada')
    expect(header.text()).not.toContain('ana@correo.es')
    expect(header.text()).not.toContain('uid-9')
    expect(header.text()).not.toContain('undefined')
    expect(header.text()).toContain('Cerrar sesión')
  })
})
