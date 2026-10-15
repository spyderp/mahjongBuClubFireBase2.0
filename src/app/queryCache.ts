import { ref } from 'vue'
import { PiniaColadaQueryHooksPlugin } from '@pinia/colada'

/** Aviso global que muestra la `BaseSnackbar` de `App.vue`. */
export type AppNotice = {
  readonly kind: 'error'
  readonly message: string
  /** Motivo real del fallo, solo en desarrollo: `code` y mensaje del SDK. */
  readonly detail: string
}

/** Mensaje mostrado en la interfaz global; `null` significa aviso cerrado. */
export const appNotice = ref<AppNotice | null>(null)

/**
 * Motivo del fallo tal y como lo devuelve el SDK (`failed-precondition`, `permission-denied`…).
 * Solo en desarrollo: en producción el aviso se queda en el mensaje de i18n, y el texto del SDK
 * puede traer rutas internas del proyecto.
 */
function detailOf(error: unknown): string {
  if (!import.meta.env.DEV) {
    return ''
  }

  if (typeof error === 'object' && error !== null) {
    const { code, message } = error as { readonly code?: unknown; readonly message?: unknown }

    return [typeof code === 'string' ? code : '', typeof message === 'string' ? message : '']
      .filter((part) => part.length > 0)
      .join(' · ')
  }

  return typeof error === 'string' ? error : ''
}

/**
 * T72 y AGENT.md → Errors: cada consulta declara `meta.errorMessage` (una clave del catálogo de
 * i18n) y este plugin la muestra en la `BaseSnackbar` global de `App.vue`. El `meta` es un objeto
 * serializable, así que `errorMessage` se comprueba antes de usarlo.
 */
export function onQueryError(error: unknown, entry: { readonly meta?: unknown }): void {
  const meta = entry.meta as { readonly errorMessage?: unknown } | undefined
  const key = meta?.errorMessage

  appNotice.value = {
    kind: 'error',
    message: typeof key === 'string' ? key : 'errors.load.games',
    detail: detailOf(error),
  }
}

export const coladaErrorPlugin = PiniaColadaQueryHooksPlugin({
  onError: (error, entry) => {
    onQueryError(error, entry)
  },
})
