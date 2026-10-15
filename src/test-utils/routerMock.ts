import { RouterLinkStub } from '@vue/test-utils'
import { vi } from 'vitest'

type MockRoute = {
  readonly path: string
  readonly fullPath: string
  readonly query: Record<string, unknown>
}

export const routerPush = vi.fn<(...args: unknown[]) => unknown>()

const defaultRoute: MockRoute = { path: '/', fullPath: '/', query: {} }

/** Estado compartido que `useRoute` devuelve en los tests de páginas. */
export const routerMockState: { route: MockRoute } = { route: defaultRoute }

/** Sustituye `useRoute` por la ruta indicada (query de filtros de páginas). */
export function setMockRoute(route: Partial<MockRoute>): void {
  routerMockState.route = { ...defaultRoute, ...route }
}

/** Fábrica para `vi.mock('vue-router', ...)`: RouterLink, `useRoute` y `useRouter`. */
export const vueRouterMock = {
  RouterLink: RouterLinkStub,
  useRoute: () => routerMockState.route,
  useRouter: () => ({ push: routerPush }),
}
