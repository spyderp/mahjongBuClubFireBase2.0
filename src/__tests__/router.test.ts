import { createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '@/app/router'
import { useSessionStore } from '@/stores/session'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return {
    getDb: fakeGetDb,
    watchAuthState: vi.fn(() => () => undefined),
    signOutSession: vi.fn(() => Promise.resolve()),
  }
})

describe('T90 · Router y guard de sesión', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('una acción de captura sin sesión redirige al acceso y conserva la ruta (RF-14.2, RF-15.3, RF-15.7)', async () => {
    const session = useSessionStore()
    session.status = 'anonymous'

    const router = createAppRouter(createMemoryHistory())
    await router.push('/partidas/nueva')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('login')
    expect(String(router.currentRoute.value.query.redirect)).toBe('/partidas/nueva')
  })

  it('intercepta también la creación de administración (RF-15.2)', async () => {
    const session = useSessionStore()
    session.status = 'anonymous'

    const router = createAppRouter(createMemoryHistory())
    await router.push('/temporadas/nueva')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('login')
    expect(String(router.currentRoute.value.query.redirect)).toBe('/temporadas/nueva')
  })

  it('con sesión, la captura resuelve en su ruta (RF-15.1)', async () => {
    const session = useSessionStore()
    session.status = 'authenticated'
    session.user = { id: 'cap-1', email: null, displayName: 'Cap', photoURL: null }

    const router = createAppRouter(createMemoryHistory())
    await router.push('/partidas/nueva')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('gameForm')
    expect(router.currentRoute.value.params).toEqual({})
  })

  it('un visitante puede consultar resultados y rankings (RF-14.1)', async () => {
    const session = useSessionStore()
    session.status = 'anonymous'

    const router = createAppRouter(createMemoryHistory())
    await router.push('/partidas/partida-1')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('gameDetail')
    expect(router.currentRoute.value.params.gameId).toBe('partida-1')
  })
})
