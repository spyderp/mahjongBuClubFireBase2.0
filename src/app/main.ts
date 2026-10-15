import { createApp } from 'vue'
import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import App from '@/app/App.vue'
import { createAppRouter } from '@/app/router'
import { colada, createAppPinia } from '@/app/pinia'
import { useSessionStore } from '@/stores/session'
import catalogo, { datetimeFormats, numberFormats } from '@/i18n/locales/es'
import '@/styles/main.css'

const app = createApp(App)
const pinia = createAppPinia()
const router = createAppRouter()
const i18n = createI18n({
  legacy: false,
  locale: 'es',
  fallbackLocale: 'es',
  globalInjection: true,
  messages: { es: catalogo },
  numberFormats: { es: numberFormats.es },
  datetimeFormats: { es: datetimeFormats.es },
})

warmupSession(() => {
  app.use(pinia)
  app.use(colada)
  app.use(router)
  app.use(i18n)
  app.mount('#app')
})

/** T70 y T90 · La sesión resuelve antes de montar para que el guard no parpadee en enlaces profundos. */
function warmupSession(mount: () => void): void {
  const session = useSessionStore(pinia)
  let started = false

  const start = (): void => {
    if (started) {
      return
    }
    started = true
    clearTimeout(watchdog)
    mount()
  }

  const stop = watch(
    () => session.status,
    (status, previous) => {
      if (previous === 'idle' && status !== 'idle') {
        stop()
        start()
      }
    },
  )

  session.initialize()

  // Borde de seguridad: si Auth no entrega el primer estado, se monta igualmente tras 2 s.
  const watchdog = setTimeout(start, 2000)
}
