import { getApp, getApps, initializeApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import type { Auth, User } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

/**
 * RF-15.6 y RNF-5: la caché local persistente se configura en la inicialización con
 * `initializeFirestore` y `persistentLocalCache`. No se llama a `getFirestore`: la
 * persistencia solo existe si se configura aquí, una vez, y el resto del código recibe
 * esa instancia mediante `getDb()`.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let db: Firestore | null = null
let auth: Auth | null = null

/** Sesión sin credenciales ni coupling con el SDK: lo único que consume `stores/session`. */
export type SessionState = {
  readonly id: string
  readonly email: string | null
  readonly displayName: string | null
  readonly photoURL: string | null
}

/**
 * T98 · RF-15.9: causas de fallo del acceso, ya traducidas. La pantalla pinta `errors.auth.*` y
 * nunca el mensaje del SDK, que revelaría si la cuenta existe.
 */
export type AuthErrorCode = 'invalidCredentials' | 'tooManyRequests' | 'network' | 'unknown'

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(`errors.auth.${code}`)
    this.name = 'AuthError'
  }
}

/**
 * Códigos que el SDK lanza cuando las credenciales no valen. `user-not-found` y `wrong-password`
 * caen aquí y se traduzen al **mismo** motivo: diferenciarlosConvertiría la pantalla de acceso en
 * un formulario de enumeración de cuentas (RF-14.3 y RNF-7).
 */
const INVALID_CREDENTIAL_CODES: ReadonlySet<string> = new Set([
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-email',
  'auth/user-disabled',
])

export function getDb(): Firestore {
  if (db === null) {
    const app = existingApp()
    db = initializeFirestore(app, { localCache: persistentLocalCache() })
  }

  return db
}

/**
 * T98 · RF-15.9: inicia sesión con correo y contraseña. No registra cuentas ni gestiona
 * credenciales: el alta se concede fuera del sistema (§2 de la spec). Ante cualquier fallo lanza
 * `AuthError` con una causa de `AuthErrorCode`, sin arrastrar el texto del SDK.
 */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(getAuthInstance(), email, password)
  } catch (caught: unknown) {
    throw toAuthError(caught)
  }
}

/**
 * Bootstrap de Auth (T70): mapea el `User` de Firebase a `SessionState` y suscribe el
 * `onAuthStateChanged` una sola vez. Devuelve la función para cancelar la suscripción. El
 * estado global vive en `stores/session`, que no importa `firebase/*` (constitution V.2).
 */
export function watchAuthState(listener: (session: SessionState | null) => void): () => void {
  return onAuthStateChanged(getAuthInstance(), (firebaseUser) => {
    listener(firebaseUser === null ? null : toSessionState(firebaseUser))
  })
}

/** Cierra la sesión del usuario autenticado (RF-15.3). El SDK expone `signOut` como función. */
export function signOutSession(): Promise<void> {
  return signOut(getAuthInstance())
}

function getAuthInstance(): Auth {
  auth ??= getAuth(existingApp())

  return auth
}

/** Lee el `code` del error de Firebase sin `any`: `unknown` con narrowing explícito (VI.1). */
function codeOf(caught: unknown): string {
  if (typeof caught === 'object' && caught !== null && 'code' in caught) {
    const { code } = caught as { readonly code?: unknown }

    return typeof code === 'string' ? code : ''
  }

  return ''
}

function toAuthError(caught: unknown): AuthError {
  const code = codeOf(caught)

  if (INVALID_CREDENTIAL_CODES.has(code)) {
    return new AuthError('invalidCredentials')
  }

  if (code === 'auth/too-many-requests') {
    return new AuthError('tooManyRequests')
  }

  if (code === 'auth/network-request-failed') {
    return new AuthError('network')
  }

  return new AuthError('unknown')
}

function toSessionState(user: User): SessionState {
  return {
    id: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  }
}

function existingApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
}
