import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouterHistory } from 'vue-router'
import { sessionGuard } from '@/app/router/guard'
import { routes } from '@/app/router/routes'

/**
 * T90 · Router de la aplicación (AGENT.md → Bootstrap): historial web por defecto, rutas
 * perezosas bajo el layout `AppShell` y guard de sesión que protege las acciones de captura.
 */
export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  const router = createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })

  router.beforeEach(sessionGuard)

  return router
}
