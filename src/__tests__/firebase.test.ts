import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  initializeAppMock,
  getAppMock,
  getAppsMock,
  initializeFirestoreMock,
  getFirestoreMock,
  persistentLocalCacheMock,
  getAuthMock,
  onAuthStateChangedMock,
  signInWithEmailAndPasswordMock,
  signOutMock,
} = vi.hoisted(() => ({
  initializeAppMock: vi.fn(() => ({ isFakeApp: true })),
  getAppMock: vi.fn(() => ({ isFakeExistingApp: true })),
  getAppsMock: vi.fn(() => []),
  initializeFirestoreMock: vi.fn(() => ({ isFakeDb: true })),
  getFirestoreMock: vi.fn(),
  persistentLocalCacheMock: vi.fn(() => ({ isPersistent: true })),
  getAuthMock: vi.fn(() => ({ isFakeAuth: true })),
  onAuthStateChangedMock: vi.fn(
    (_auth: unknown, _listener: (user: unknown) => void) => () => undefined,
  ),
  signInWithEmailAndPasswordMock: vi.fn(() => Promise.resolve({ user: { uid: 'u1' } })),
  signOutMock: vi.fn(() => Promise.resolve()),
}))

vi.mock('firebase/app', () => ({
  initializeApp: initializeAppMock,
  getApp: getAppMock,
  getApps: getAppsMock,
}))

vi.mock('firebase/firestore', () => ({
  initializeFirestore: initializeFirestoreMock,
  getFirestore: getFirestoreMock,
  persistentLocalCache: persistentLocalCacheMock,
}))

vi.mock('firebase/auth', () => ({
  getAuth: getAuthMock,
  onAuthStateChanged: onAuthStateChangedMock,
  signInWithEmailAndPassword: signInWithEmailAndPasswordMock,
  signOut: signOutMock,
}))

/** Lee la causa de un `AuthError` sin repetir el tipo en cada aserción. */
function codeOf(error: unknown): string {
  return (error as { readonly code?: string }).code ?? ''
}

/** Error de Firebase Auth con el `code` que devuelve el SDK en el navegador, con su prefijo `auth/`. */
function authError(code: string): Error & { code: string } {
  return Object.assign(new Error(`error de firebase: ${code}`), { code: `auth/${code}` })
}

describe('T58 · app/firebase.ts con caché local persistente', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('inicializa Firestore con initializeFirestore y persistentLocalCache', async () => {
    const { getDb } = await import('@/app/firebase')
    const db = getDb()

    expect(db).toBeDefined()
    expect(initializeFirestoreMock).toHaveBeenCalledTimes(1)
    expect(initializeFirestoreMock).toHaveBeenCalledWith(expect.anything(), {
      localCache: { isPersistent: true },
    })
    expect(getFirestoreMock).not.toHaveBeenCalled()
  })

  it('nunca llama a getFirestore', async () => {
    const { getDb } = await import('@/app/firebase')

    getDb()

    expect(getFirestoreMock).not.toHaveBeenCalled()
  })

  it('reutiliza la misma instancia en llamadas sucesivas', async () => {
    const { getDb } = await import('@/app/firebase')
    const first = getDb()
    const second = getDb()

    expect(first).toBe(second)
    expect(initializeFirestoreMock).toHaveBeenCalledTimes(1)
  })
})

/**
 * T98 · RF-15.9 y RF-14.3: el acceso es correo y contraseña con Firebase Authentication, sin
 * registro en la aplicación. Lo delicate es la traducción de errores: el sistema no puede
 * distinguir «la cuenta no existe» de «la contraseña no es la correcta», así que ambos códigos
 * caen en el mismo mensaje único.
 */
describe('T98 · app/firebase.ts acceso con correo y contraseña', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    signInWithEmailAndPasswordMock.mockResolvedValue({ user: { uid: 'u1' } })
  })

  it('inicia sesión con el correo y la contraseña recibidos', async () => {
    const { signInWithEmail } = await import('@/app/firebase')

    await expect(signInWithEmail('ana@correo.es', 'secreta')).resolves.toBeUndefined()

    expect(signInWithEmailAndPasswordMock).toHaveBeenCalledTimes(1)
    expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(
      { isFakeAuth: true },
      'ana@correo.es',
      'secreta',
    )
  })

  it('rechaza una cuenta inexistente con el mismo mensaje que una contraseña incorrecta (RF-14.3)', async () => {
    const { signInWithEmail, AuthError } = await import('@/app/firebase')

    signInWithEmailAndPasswordMock.mockRejectedValueOnce(authError('user-not-found'))
    const missing = await signInWithEmail('nadie@correo.es', 'secreta').catch(
      (error: unknown) => error,
    )

    signInWithEmailAndPasswordMock.mockRejectedValueOnce(authError('wrong-password'))
    const wrong = await signInWithEmail('ana@correo.es', 'otra').catch((error: unknown) => error)

    expect(missing).toBeInstanceOf(AuthError)
    expect(wrong).toBeInstanceOf(AuthError)
    expect(codeOf(missing)).toBe('invalidCredentials')
    expect(codeOf(wrong)).toBe('invalidCredentials')
    // El texto del SDK no puede acabar en la interfaz: revelaría si la cuenta existe.
    expect(String((missing as Error).message)).not.toContain('user-not-found')
  })

  it('traduce el código nuevo invalid-credential y el correo mal formado', async () => {
    const { signInWithEmail, AuthError } = await import('@/app/firebase')

    signInWithEmailAndPasswordMock.mockRejectedValueOnce(authError('invalid-credential'))
    const invalid = await signInWithEmail('ana@correo.es', 'secreta').catch(
      (error: unknown) => error,
    )

    signInWithEmailAndPasswordMock.mockRejectedValueOnce(authError('invalid-email'))
    const malformed = await signInWithEmail('ana', 'secreta').catch((error: unknown) => error)

    expect(invalid).toBeInstanceOf(AuthError)
    expect(malformed).toBeInstanceOf(AuthError)
    expect(codeOf(invalid)).toBe('invalidCredentials')
    expect(codeOf(malformed)).toBe('invalidCredentials')
  })

  it('distingue demasiados intentos y fallo de red, que sí conviene diferenciar', async () => {
    const { signInWithEmail, AuthError } = await import('@/app/firebase')

    signInWithEmailAndPasswordMock.mockRejectedValueOnce(authError('too-many-requests'))
    const throttled = await signInWithEmail('ana@correo.es', 'secreta').catch(
      (error: unknown) => error,
    )

    signInWithEmailAndPasswordMock.mockRejectedValueOnce(authError('network-request-failed'))
    const offline = await signInWithEmail('ana@correo.es', 'secreta').catch(
      (error: unknown) => error,
    )

    expect(throttled).toBeInstanceOf(AuthError)
    expect(offline).toBeInstanceOf(AuthError)
    expect(codeOf(throttled)).toBe('tooManyRequests')
    expect(codeOf(offline)).toBe('network')
  })

  it('cualquier otro fallo se traduce a una causa desconocida, sin filtrar el código', async () => {
    const { signInWithEmail, AuthError } = await import('@/app/firebase')

    signInWithEmailAndPasswordMock.mockRejectedValueOnce(authError('internal-error'))
    const unknown = await signInWithEmail('ana@correo.es', 'secreta').catch(
      (error: unknown) => error,
    )

    expect(unknown).toBeInstanceOf(AuthError)
    expect(codeOf(unknown)).toBe('unknown')
    expect(String((unknown as Error).message)).not.toContain('internal-error')
  })

  it('cerrar sesión usa el signOut del SDK (RF-15.3)', async () => {
    const { signOutSession } = await import('@/app/firebase')

    await signOutSession()

    expect(signOutMock).toHaveBeenCalledWith({ isFakeAuth: true })
  })

  it('watchAuthState se suscribe una vez y devuelve la cancelación', async () => {
    const { watchAuthState } = await import('@/app/firebase')
    const unsubscribe = vi.fn()
    onAuthStateChangedMock.mockReturnValueOnce(unsubscribe)

    const stop = watchAuthState(() => undefined)

    expect(stop).toBe(unsubscribe)
    expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1)
    expect(onAuthStateChangedMock.mock.calls[0]?.[0]).toEqual({ isFakeAuth: true })
  })
})
