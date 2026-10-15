import { RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '@/pages/LoginPage.vue'
import { signInWithEmail } from '@/app/firebase'
import { playersRepository } from '@/data/players.repository'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { createTestI18n } from '@/test-utils/i18n'
import { routerPush, setMockRoute } from '@/test-utils/routerMock'
import { useSessionStore } from '@/stores/session'

const authState = vi.hoisted(() => ({
  listener: null as ((user: unknown) => void) | null,
}))

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return {
    getDb: fakeGetDb,
    watchAuthState: vi.fn((listener: (user: unknown) => void) => {
      authState.listener = listener

      return () => undefined
    }),
    signOutSession: vi.fn(() => Promise.resolve()),
    signInWithEmail: vi.fn(() => Promise.resolve()),
    AuthError: class AuthError extends Error {
      constructor(readonly code: string) {
        super(code)
      }
    },
  }
})
vi.mock('vue-router', async () => {
  const { vueRouterMock } = await import('@/test-utils/routerMock')

  return vueRouterMock
})

const signInMock = vi.mocked(signInWithEmail)

let pinia: ReturnType<typeof createPinia>

function mountPage(): ReturnType<typeof mount> {
  return mount(LoginPage, { global: { plugins: [pinia, createTestI18n()] } })
}

/** Es lo que emite `onAuthStateChanged` cuando `signInWithEmailAndPassword` resuelve. */
function authStateArrives(): void {
  authState.listener?.({ id: 'u1', email: 'ana@correo.es', displayName: null, photoURL: null })
}

async function fill(
  wrapper: ReturnType<typeof mountPage>,
  email: string,
  password: string,
): Promise<void> {
  await wrapper.find('input[name="email"]').setValue(email)
  await wrapper.find('input[name="password"]').setValue(password)
  await wrapper.find('form').trigger('submit')
}

describe('T100 · LoginPage acceso con correo y contraseña', () => {
  beforeEach(() => {
    fakeReset()
    setMockRoute({})
    routerPush.mockClear()
    authState.listener = null
    signInMock.mockReset()
    signInMock.mockResolvedValue(undefined)
    pinia = createPinia()
    setActivePinia(pinia)
    // `main.ts` arranca la escucha de Auth antes de montar; la página se limita a observarla.
    useSessionStore().initialize()
  })

  it('pide correo y contraseña con el tipo y el autocomplete que espera el navegador (RF-15.9)', () => {
    const wrapper = mountPage()

    const email = wrapper.find('input[name="email"]')
    const password = wrapper.find('input[name="password"]')

    expect(email.exists()).toBe(true)
    expect(email.attributes('type')).toBe('email')
    expect(email.attributes('autocomplete')).toBe('email')
    expect(password.attributes('type')).toBe('password')
    expect(password.attributes('autocomplete')).toBe('current-password')
  })

  it('inicia sesión con lo escrito y envía a la ruta guardada (RF-15.9, RF-15.3)', async () => {
    setMockRoute({ query: { redirect: '/partidas/nueva' } })
    const wrapper = mountPage()

    await fill(wrapper, 'ana@correo.es', 'secreta')
    await vi.waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    expect(signInMock).toHaveBeenCalledWith('ana@correo.es', 'secreta')

    authStateArrives()

    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith('/partidas/nueva'))
  })

  it('sin ruta guardada envía al panel', async () => {
    const wrapper = mountPage()

    await fill(wrapper, 'ana@correo.es', 'secreta')
    authStateArrives()

    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith('/'))
  })

  it('ignora un redirect que no es una ruta interna y no lo usa (T101)', async () => {
    setMockRoute({ query: { redirect: 'https://otro.example/robo' } })
    const wrapper = mountPage()

    await fill(wrapper, 'ana@correo.es', 'secreta')
    authStateArrives()

    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith('/'))
    expect(routerPush).not.toHaveBeenCalledWith('https://otro.example/robo')
  })

  /**
   * RF-14.3 y RNF-7: el mensaje es único. Si el sistema dijera «esa cuenta no existe», la
   * pantalla dejaría de ser un formulario de acceso y sería un enumerador de cuentas del club.
   */
  it('credenciales incorrectas muestran un único mensaje, sin revelar si la cuenta existe', async () => {
    signInMock.mockRejectedValue(new Error('errors.auth.invalidCredentials'))
    const wrapper = mountPage()

    await fill(wrapper, 'nadie@correo.es', 'secreta')

    await vi.waitFor(() => expect(wrapper.text()).toContain('No hemos podido iniciar sesión'))
    expect(wrapper.text()).not.toContain('no existe')
    expect(wrapper.text()).not.toContain('contraseña incorrecta')
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('distingue el fallo de red del rechazo de credenciales (RF-15.7)', async () => {
    signInMock.mockRejectedValue(new Error('errors.auth.network'))
    const wrapper = mountPage()

    await fill(wrapper, 'ana@correo.es', 'secreta')

    await vi.waitFor(() => expect(wrapper.text()).toContain('No hay conexión'))
  })

  it('explica demasiados intentos sin detallar nada de la cuenta', async () => {
    signInMock.mockRejectedValue(new Error('errors.auth.tooManyRequests'))
    const wrapper = mountPage()

    await fill(wrapper, 'ana@correo.es', 'secreta')

    await vi.waitFor(() => expect(wrapper.text()).toContain('demasiados intentos'))
  })

  it('mantiene el formulario con lo escrito cuando el acceso falla (RF-15.7)', async () => {
    signInMock.mockRejectedValue(new Error('errors.auth.invalidCredentials'))
    const wrapper = mountPage()

    await fill(wrapper, 'ana@correo.es', 'secreta')

    await vi.waitFor(() => expect(wrapper.text()).toContain('No hemos podido iniciar sesión'))
    expect(wrapper.find<HTMLInputElement>('input[name="email"]').element.value).toBe(
      'ana@correo.es',
    )
  })

  it('deshabilita el envío mientras el acceso está en vuelo y lo rehabilita al fallar', async () => {
    let release: (() => void) | undefined
    signInMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const wrapper = mountPage()

    await wrapper.find('input[name="email"]').setValue('ana@correo.es')
    await wrapper.find('input[name="password"]').setValue('secreta')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined(),
    )

    release?.()

    await vi.waitFor(() =>
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined(),
    )
  })

  it('con sesión ya iniciada no pide nada y vuelve a la ruta guardada (RF-15.4)', async () => {
    setMockRoute({ query: { redirect: '/partidas/nueva' } })
    const session = useSessionStore()
    session.status = 'authenticated'
    session.user = { id: 'u1', email: null, displayName: null, photoURL: null }

    mountPage()

    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith('/partidas/nueva'))
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('no expone datos de la cuenta ni información de otros usuarios (RF-14.3, RNF-7)', async () => {
    await playersRepository.create({ externalId: 'P-9', name: 'Mario' })
    const session = useSessionStore()
    session.status = 'authenticated'
    session.user = {
      id: 'cap-9',
      email: 'cap@propia.es',
      displayName: 'Capitán',
      photoURL: 'https://cdn.example.com/cap.png',
    }

    const wrapper = mountPage()

    expect(wrapper.text()).toContain('Acceso')
    expect(wrapper.text()).not.toContain('cap@propia.es')
    expect(wrapper.text()).not.toContain('cap-9')
    expect(wrapper.text()).not.toContain('Capitán')
    expect(wrapper.text()).not.toContain('cdn.example.com')
    expect(wrapper.text()).not.toContain('Mario')
  })

  it('sigue explicando que las cuentas se conceden fuera de la aplicación', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('se conceden fuera de la aplicación')
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.map((link) => link.props('to'))).toContain('/partidas')
  })
})
