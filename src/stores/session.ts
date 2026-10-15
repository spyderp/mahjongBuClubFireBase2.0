import { defineStore } from 'pinia'
import { ref } from 'vue'
import { signInWithEmail, signOutSession, watchAuthState } from '@/app/firebase'
import type { SessionState } from '@/app/firebase'

export type SessionStatus = 'idle' | 'anonymous' | 'authenticated'

/**
 * T70 · RF-15.1 a RF-15.5: usuario autenticado y estado de la sesión. El store solo se
 * suscribe al bootstrap de `app/firebase.ts` y no importa `firebase/*` (constitution V.2).
 * Vive mientras dura la aplicación, por eso el usuario sobrevive a la navegación.
 */
export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('idle')
  const user = ref<SessionState | null>(null)
  const error = ref<Error | null>(null)
  /** T99 · RF-15.9: hay un acceso en vuelo, para deshabilitar el formulario mientras espera. */
  const pending = ref(false)

  let unsubscribe: (() => void) | null = null

  /** Arranca la escucha de Auth; idempotente, se llama una vez al montar la aplicación. */
  function initialize(): void {
    if (unsubscribe !== null) {
      return
    }

    unsubscribe = watchAuthState((next) => {
      user.value = next
      status.value = next === null ? 'anonymous' : 'authenticated'
    })
  }

  /**
   * T99 · RF-15.9: inicia sesión con correo y contraseña. No fija `status` a mano: el estado lo
   * sigue determinando `watchAuthState`, así que no hay dos fuentes de verdad (RF-15.4). El
   * `AuthError` del bootstrap trae ya la causa traducida, que la pantalla traduce a `errors.auth.*`.
   */
  async function signIn(email: string, password: string): Promise<void> {
    pending.value = true
    error.value = null

    try {
      await signInWithEmail(email, password)
    } catch (caught: unknown) {
      error.value = caught instanceof Error ? caught : new Error(String(caught))
      throw caught
    } finally {
      pending.value = false
    }
  }

  async function signOut(): Promise<void> {
    try {
      await signOutSession()
    } catch (caught: unknown) {
      error.value = caught instanceof Error ? caught : new Error(String(caught))
      throw caught
    }
  }

  return { status, user, error, pending, initialize, signIn, signOut }
})
