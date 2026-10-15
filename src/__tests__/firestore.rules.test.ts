// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deleteApp, initializeApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, signOut } from 'firebase/auth'
import {
  doc,
  getDoc,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  terminate,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collectionGroupUsages } from '@/test-utils/firestoreQueries'

const ROOT = join(import.meta.dirname, '..', '..')
const RULES_PATH = join(ROOT, 'firestore.rules')

/**
 * T92 necesita el emulador de Firestore, que requiere una JRE y `npx firebase emulators:start`
 * en otra terminal (`AGENT.md` → Commands: `npm run emulators` no existe a propósito, porque
 * sería una dependencia nueva). Sin `FIRESTORE_EMULATOR_HOST` el bloque se salta **dicho** en
 * consola: no es verde por omisión, es una tarea sin comprobar.
 */
const FIRESTORE_HOST = process.env['FIRESTORE_EMULATOR_HOST'] ?? ''
const AUTH_HOST = process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? ''
const EMULATOR = FIRESTORE_HOST.length > 0 && AUTH_HOST.length > 0

const PROJECT_ID = process.env['FIRESTORE_EMULATOR_PROJECT'] ?? 'demo-mahjongbu-club'

/**
 * Colecciones del modelo de `plan.md` §4.1. Se listan también los documentos intermedios
 * (`/games/{gameId}`, `/playerSeasonStats/{playerId}`, `/rankings/{seasonId}`): las reglas los
 * anidan, así que cada nivel declara su lectura pública y su escritura autenticada.
 */
const EXPECTED_PATHS = [
  '/players/{playerId}',
  '/seasons/{seasonId}',
  '/games/{gameId}',
  '/games/{gameId}/turns/{turnNo}',
  '/playerSeasonStats/{playerId}',
  '/playerSeasonStats/{playerId}/stats/{seasonId}',
  '/{parent=**}/stats/{seasonId}',
  '/rankings/{seasonId}',
  '/rankings/{seasonId}/players/{playerId}',
] as const

const CATCH_ALL = '/{document=**}'

/** Raíz del árbol de reglas: no es una colección del modelo y por eso se descarta. */
const ROOT_MATCH = '/databases/{database}/documents'

type RuleBlock = {
  readonly path: string
  readonly allows: readonly string[]
}

/** El parser va llenando `allows`, así que trabaja con un tipo mutable y devuelve el de lectura. */
type MutableBlock = { path: string; allows: string[] }

/**
 * T91 · «la lectura es pública, la escritura exige sesión y no hay ninguna regla con `admin`».
 * Se comprueba sobre el fichero de reglas, así que corre sin emulador y sin Java.
 */
describe('T91 · firestore.rules', () => {
  it('declara rules_version 2 y el servicio de Firestore', async () => {
    const source = await rules()

    expect(source).toContain("rules_version = '2'")
    expect(source).toContain('service cloud.firestore')
    expect(source).toContain('/databases/{database}/documents')
  })

  it('cubre exactamente las colecciones del modelo y cierra el resto con un catch-all', async () => {
    const paths = (await blocks()).map((block) => block.path)

    for (const expected of EXPECTED_PATHS) {
      expect(paths).toContain(expected)
    }

    expect(paths.filter((path) => path !== CATCH_ALL).sort()).toEqual([...EXPECTED_PATHS].sort())
  })

  it('deja la lectura pública en todas las colecciones del modelo (RF-14.1)', async () => {
    for (const block of await blocks()) {
      if (block.path === CATCH_ALL) {
        continue
      }

      expect(block.allows).toContain('allow read: if true')
    }
  })

  it('exige sesión para cualquier escritura, sin niveles de permiso (RF-15.1, RF-15.2)', async () => {
    for (const block of await blocks()) {
      if (block.path === CATCH_ALL) {
        continue
      }

      expect(block.allows).toContain('allow write: if isAuthenticated()')
      expect(block.allows).not.toContain('allow read, write: if true')
    }
  })

  it('isAuthenticated() solo comprueba la sesión y nada más', async () => {
    const source = stripComments(await rules())

    expect(source).toMatch(
      /function\s+isAuthenticated\(\)\s*\{\s*return\s+request\.auth\s*!=\s*null;\s*\}/,
    )
  })

  it('no menciona `admin` en ninguna regla (RF-15.5)', async () => {
    const source = stripComments(await rules())

    expect(source.toLowerCase()).not.toContain('admin')
    expect(source).not.toMatch(/request\.auth\.token/)
  })

  it('el catch-all deniega leer y escribir sin condiciones', async () => {
    const catchAll = (await blocks()).find((block) => block.path === CATCH_ALL)

    expect(catchAll?.allows).toEqual(['allow read, write: if false'])
  })

  it('el mismo fichero de reglas es el que declara firebase.json', async () => {
    const config = JSON.parse(await readFile(join(ROOT, 'firebase.json'), 'utf8')) as {
      firestore?: { rules?: string }
      emulators?: { firestore?: { port?: number }; auth?: { port?: number } }
    }

    expect(config.firestore?.rules).toBe('firestore.rules')
    expect(config.emulators?.firestore?.port).toBe(8080)
    expect(config.emulators?.auth?.port).toBe(9099)
  })

  /**
   * T105 · RF-12.5: una consulta a un grupo de colección solo se concede si las reglas cubren el
   * grupo con un comodín recursivo sobre el padre. Con una ruta literal, Firestore no puede
   * probar que la consulta solo devuelve documentos permitidos y **deniega la petición entera**,
   * no solo los documentos que no encajen («las reglas no son filtros»).
   *
   * El test lee los grupos de colección del código en vez de escribir «stats» a mano, así que
   * también cubre el siguiente grupo de colección que se añada sin regla.
   */
  it('toda colección consultada en grupo tiene regla con comodín recursivo (T105)', async () => {
    const usages = await collectionGroupUsages(join(ROOT, 'src', 'data'))
    const paths = (await blocks()).map((block) => block.path)

    expect(usages.length).toBeGreaterThan(0)

    for (const usage of usages) {
      const wildcard = paths.find((path) =>
        new RegExp(`^/\\{[a-zA-Z]+=\\*\\*\\}/${usage.id}/\\{[a-zA-Z]+\\}$`).test(path),
      )

      if (wildcard === undefined) {
        throw new Error(
          `collectionGroup('${usage.id}') se consulta en ${usage.repository} pero no hay regla ` +
            `/{parent=**}/${usage.id}/{doc}: la consulta se denegaría entera`,
        )
      }
    }
  })

  it('el comodín del grupo de colección lee en público y escribe con sesión (T105)', async () => {
    const block = (await blocks()).find((candidate) =>
      /^\/\{parent=\*\*\}\/stats\/\{seasonId\}$/.test(candidate.path),
    )

    expect(block?.allows).toContain('allow read: if true')
    expect(block?.allows).toContain('allow write: if isAuthenticated()')
  })
})

/**
 * T92 · contra el emulador, no contra el fichero: un anónimo lee, un anónimo recibe
 * `permission-denied` al escribir y un autenticado escribe.
 */
describe.skipIf(!EMULATOR)('T92 · firestore.rules contra el emulador', () => {
  let app: FirebaseApp
  let db: Firestore

  beforeAll(async () => {
    /**
     * `apiKey` no se usa para nada contra el emulador, pero `getAuth` lo exige para inicializarse:
     * sin él la suite moría con `auth/invalid-api-key` antes de tocar la base de datos.
     */
    app = initializeApp(
      { apiKey: 'emulador-local-sin-uso', projectId: PROJECT_ID },
      `rules-${Date.now().toString(36)}`,
    )
    connectAuthEmulator(getAuth(app), `http://${AUTH_HOST}`, { disableWarnings: true })
    db = initializeFirestore(app, { host: FIRESTORE_HOST, ssl: false })

    // Sembrado con sesión: escribir sin ella está denegado por las propias reglas que se prueban.
    await signInAnonymously(getAuth(app))
    await setDoc(doc(db, 'players', 'p1'), { name: 'p1', createdAt: serverTimestamp() })
    await signOut(getAuth(app))
  })

  afterAll(async () => {
    if (db !== undefined) {
      await terminate(db)
    }
    if (app !== undefined) {
      await deleteApp(app)
    }
  })

  it('un anónimo lee la partida y sus turnos (RF-14.1)', async () => {
    const snapshot = await getDoc(doc(db, 'players', 'p1'))

    expect(snapshot.exists()).toBe(true)
  })

  it('un anónimo recibe permission-denied al escribir (RF-15.1, RF-15.2)', async () => {
    await expect(setDoc(doc(db, 'seasons', 'anon'), { title: 'No permitido' })).rejects.toThrow(
      /permission/i,
    )
  })

  it('un autenticado escribe en cada colección del modelo (RF-15.1)', async () => {
    await signInAnonymously(getAuth(app))

    await expect(
      setDoc(doc(db, 'seasons', 'auth'), { title: 'Permitido' }),
    ).resolves.toBeUndefined()
    await expect(
      setDoc(doc(db, 'games', 'auth'), { status: 'open', updatedAt: serverTimestamp() }),
    ).resolves.toBeUndefined()
    await expect(
      setDoc(doc(db, 'games', 'auth', 'turns', '01'), { resultType: 'tsumo' }),
    ).resolves.toBeUndefined()
    await expect(
      setDoc(doc(db, 'rankings', 'auth', 'players', 'p1'), { rank: 1 }),
    ).resolves.toBeUndefined()
    await expect(
      setDoc(doc(db, 'playerSeasonStats', 'p1', 'stats', 'auth'), { gamesPlayed: 1 }),
    ).resolves.toBeUndefined()
  })

  it('al cerrar sesión la escritura vuelve a denegarse (RF-15.3)', async () => {
    await signOut(getAuth(app))

    await expect(
      setDoc(doc(db, 'seasons', 'anon-again'), { title: 'No permitido' }),
    ).rejects.toThrow(/permission/i)
  })
})

if (!EMULATOR) {
  console.warn(
    [
      '',
      'T92 SIN COMPROBAR: no hay emulador de Firestore.',
      'Levántalo con `npx firebase emulators:start` (necesita una JRE) y repite con',
      'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 y FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099.',
      'T91 sí se ha comprobado: no depende del emulador.',
      '',
    ].join('\n'),
  )
}

function rules(): Promise<string> {
  return readFile(RULES_PATH, 'utf8')
}

/** Lectura mínima del fichero de reglas: bloques `match` y sus `allow`, sin comentarios. */
async function blocks(): Promise<readonly RuleBlock[]> {
  return parseBlocks(stripComments(await rules()))
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function parseBlocks(source: string): readonly RuleBlock[] {
  const found: MutableBlock[] = []
  const stack: (MutableBlock | 'function')[] = []

  for (const raw of source.split('\n')) {
    const line = raw.trim()

    if (line === '') {
      continue
    }

    if (line.startsWith('function ')) {
      stack.push('function')
      continue
    }

    if (line.startsWith('match ')) {
      const relative = line.slice('match '.length, line.lastIndexOf('{')).trim()
      const parent = stack.at(-1)
      // `match /databases/{database}/documents` es la raíz del árbol, no un prefijo de ruta.
      const prefix =
        parent !== undefined && parent !== 'function' && parent.path !== ROOT_MATCH
          ? parent.path
          : ''
      const block: MutableBlock = {
        path:
          prefix === ''
            ? relative
            : `${prefix}/${relative.startsWith('/') ? relative.slice(1) : relative}`,
        allows: [],
      }
      found.push(block)
      stack.push(block)
      continue
    }

    if (line.startsWith('allow ')) {
      const current = stack.at(-1)

      if (current !== undefined && current !== 'function') {
        current.allows.push(line.replace(/;$/, ''))
      }

      continue
    }

    if (line.startsWith('}')) {
      stack.pop()
    }
  }

  // El primer `match` es la raíz `/databases/{database}/documents`, no una colección.
  return found.filter((block) => block.path !== ROOT_MATCH)
}
