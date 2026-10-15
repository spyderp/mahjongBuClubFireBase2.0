import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session'
import type { SessionState } from '@/app/firebase'

type AuthListener = (state: SessionState | null) => void

const mocks = vi.hoisted(() => ({
  watchState: vi.fn<(listener: AuthListener) => () => void>(),
  signOut: vi.fn<() => Promise<void>>(),
  signIn: vi.fn<(email: string, password: string) => Promise<void>>(),
}))

vi.mock('@/app/firebase', () => ({
  watchAuthState: (listener: AuthListener): (() => void) => {
    mocks.watchState(listener)

    return () => {}
  },
  signOutSession: (): Promise<void> => mocks.signOut(),
  signInWithEmail: (email: string, password: string): Promise<void> =>
    mocks.signIn(email, password),
  AuthError: class AuthError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
}))

function lastListener(): AuthListener | undefined {
  return mocks.watchState.mock.calls[mocks.watchState.mock.calls.length - 1]?.[0]
}

describe('T70 · stores/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('arranca idle sin usuario y sin error', () => {
    const store = useSessionStore()

    expect(store.status).toBe('idle')
    expect(store.user).toBeNull()
    expect(store.error).toBeNull()
  })

  it('initialize se suscribe una única vez y escucha el estado de auth', () => {
    const store = useSessionStore()

    store.initialize()
    store.initialize()

    expect(mocks.watchState).toHaveBeenCalledTimes(1)
  })

  it('pasa a anonymous cuando la sesión se cierra y authenticated al autenticarse', () => {
    const store = useSessionStore()

    store.initialize()

    lastListener()?.(null)

    expect(store.status).toBe('anonymous')
    expect(store.user).toBeNull()

    lastListener()?.({ id: 'u1', email: 'ana@example.com', displayName: 'Ana', photoURL: null })

    expect(store.status).toBe('authenticated')
    expect(store.user).toMatchObject({ id: 'u1', email: 'ana@example.com', displayName: 'Ana' })
  })

  it('signOut cierra la sesión y no deja error', async () => {
    mocks.signOut.mockResolvedValueOnce(undefined)
    const store = useSessionStore()

    await store.signOut()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(store.error).toBeNull()
  })

  it('signOut propaga el fallo y guarda el error', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('auth boom'))
    const store = useSessionStore()

    await expect(store.signOut()).rejects.toThrow('auth boom')
    expect(store.error).toBeInstanceOf(Error)
  })

  it('la sesión sobrevive entre navegaciones: el estado vive en el store único', () => {
    const first = useSessionStore()
    const second = useSessionStore()

    expect(second).toBe(first)
  })

  /**
   * T99 · RF-15.9: `signIn` delega el acceso en `app/firebase.ts` y no toca `status`: el estado
   * lo sigue fijando el `onAuthStateChanged` que ya había, que es la única fuente de verdad
   * (así se cumple RF-15.4 sin duplicar el estado).
   */
  it('signIn delega el acceso con el correo y la contraseña (RF-15.9)', async () => {
    mocks.signIn.mockResolvedValueOnce(undefined)
    const store = useSessionStore()

    await store.signIn('ana@correo.es', 'secreta')

    expect(mocks.signIn).toHaveBeenCalledWith('ana@correo.es', 'secreta')
    expect(store.pending).toBe(false)
    expect(store.error).toBeNull()
  })

  it('signIn marca pending mientras la llamada está en vuelo', async () => {
    const store = useSessionStore()
    let release: (() => void) | undefined
    mocks.signIn.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const attempt = store.signIn('ana@correo.es', 'secreta')
    await Promise.resolve()

    expect(store.pending).toBe(true)

    release?.()
    await attempt

    expect(store.pending).toBe(false)
  })

  it('signIn propaga el rechazo y deja el motivo de dominio en error (RF-14.3)', async () => {
    mocks.signIn.mockRejectedValueOnce(new Error('errors.auth.invalidCredentials'))
    const store = useSessionStore()

    await expect(store.signIn('ana@correo.es', 'secreta')).rejects.toThrow('invalidCredentials')
    expect(store.error).toBeInstanceOf(Error)
    expect(store.pending).toBe(false)
  })

  it('el estado lo fija el listener, no la llamada a signIn', async () => {
    mocks.signIn.mockResolvedValueOnce(undefined)
    const store = useSessionStore()
    store.initialize()

    await store.signIn('ana@correo.es', 'secreta')

    // El listener no ha recibido nada todavía: si `signIn` fijara el estado por su cuenta, esto
    // ya sería 'authenticated'. Sigo en 'idle' porque el mock no emite el primer estado.
    expect(store.status).toBe('idle')

    lastListener()?.({ id: 'u1', email: 'ana@correo.es', displayName: null, photoURL: null })

    expect(store.status).toBe('authenticated')
    expect(store.user?.id).toBe('u1')
  })

  it('initialize sigue siendo idempotente y no duplica la suscripción (V.2)', () => {
    const store = useSessionStore()

    store.initialize()
    store.initialize()
    store.signIn('ana@correo.es', 'secreta').catch(() => undefined)

    expect(mocks.watchState).toHaveBeenCalledTimes(1)
    expect(mocks.signIn).toHaveBeenCalledTimes(1)
  })
})
