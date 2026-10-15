import { createPinia } from 'pinia'
import type { Pinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import type { Plugin } from 'vue'
import { coladaErrorPlugin } from '@/app/queryCache'

/** Instancia de Pinia de la aplicación (una sola, constitution V.2). */
export function createAppPinia(): Pinia {
  return createPinia()
}

/** Plugin que conecta @pinia/colada con el aviso global de errores de carga (T72). */
export const colada: Plugin = {
  install(app) {
    app.use(PiniaColada, { plugins: [coladaErrorPlugin] })
  },
}
