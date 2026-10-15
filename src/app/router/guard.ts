import type { NavigationGuardWithThis } from 'vue-router'
import { useSessionStore } from '@/stores/session'

/**
 * T90 · RF-14.2, RF-15.1, RF-15.2 y RF-15.3: sin sesión, las rutas de captura y administración
 * redirigen a `/sesion` conservando la ruta completa en `query.redirect` para no perder lo escrito.
 */
export const sessionGuard: NavigationGuardWithThis<undefined> = (to) => {
  const session = useSessionStore()

  if (to.meta.requiresAuth === true && session.status !== 'authenticated') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
}
