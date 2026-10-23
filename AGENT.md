# AGENT.md — MahjongBuClub

Convenciones y arquitectura para agentes y para las personas que trabajen en este repositorio.
El repositorio es un proyecto **desde cero**: no hay código heredado que conservar ni migrar.

La descripción del dominio de Mahjong y las reglas de puntuación están en
[`docs/domain.md`](docs/domain.md). Este documento solo describe **cómo se construye el software**.

---

## Project

SPA para llevar las estadísticas de un club de Mahjong Riichi: registro de partidas turno a turno,
cálculo del valor de cada mano y del resultado de la partida, y ranking por temporada con
estadísticas por jugador.

Entidades: `players`, `seasons`, `games` con sus `turns`, `playerSeasonStats`, `rankings`.

### Stack

Versiones fijadas y verificadas como mut compatibles. Cambiar cualquiera exige actualizar la spec
y comprobar los `peerDependencies` del paquete afectado.

| Capa              | Paquete                | Versión  |
| ----------------- | ---------------------- | -------- |
| Lenguaje          | `typescript`           | `~5.9.3` |
| Typecheck         | `vue-tsc`              | `3.3.12` |
| Framework         | `vue`                  | `3.5.43` |
| Build             | `vite`                 | `8.3.2`  |
| Plugin de build   | `@vitejs/plugin-vue`   | `6.0.9`  |
| Routing           | `vue-router`           | `5.3.1`  |
| Estado global     | `pinia`                | `4.0.3`  |
| Caché de datos    | `@pinia/colada`        | `1.4.7`  |
| Datos de servidor | `firebase`             | `12.19.0`|
| CLI de Firebase   | `firebase-tools`       | `15.32.1`|
| Estilos           | `tailwindcss` + `@tailwindcss/vite` | `4.3.3` |
| Gráficas          | `chart.js`             | `4.5.1`  |
| Selección         | `@vueform/multiselect` | `2.6.11` |
| Textos            | `vue-i18n`             | `11.4.13`|
| Lint              | `eslint` + `typescript-eslint` + `eslint-plugin-vue` | `10.12.0` / `8.71.0` / `10.11.1` |
| Formato           | `prettier` + `@vue/eslint-config-prettier` | `3.9.9` / `10.2.0` |
| Tests             | `vitest` + `@vue/test-utils` + `happy-dom` + `@vitest/coverage-v8` | `5.0.3` / `2.5.1` / `20.14.5` / `5.0.3` |

Cuatro paquetes que el stack necesita pero no son elecciones propias: son **peers obligatorios** de
paquetes ya fijados, comprobados con constitution II.1. Añadirlos no es ampliar el stack.

| Paquete                 | Versión  | Peer de                          | Por qué                                                        |
| ----------------------- | -------- | -------------------------------- | -------------------------------------------------------------- |
| `vue-eslint-parser`     | `10.4.1` | `eslint-plugin-vue@10.11.1`      | Sin él, el parser de Vue no resuelve SFC                       |
| `@types/node`           | `24.19.1`| `vitest@5.0.3`                   | `^22.0.0 \|\| >=24.0.0`; línea 24 para casar con el runtime    |
| `@vitest/eslint-plugin` | `1.6.27` | —                                | Lo exige §Lint: «Plugin de Vitest acotado a `src/__tests__/`»   |
| `globals`               | `17.13.0`| —                                | Standard de flat config para `globals.browser` y `globals.node`|

Dos peers de `eslint-plugin-vue` son **opcionales** y no se instalan: `@stylistic/eslint-plugin` y
`@typescript-eslint/parser`. El segundo llega como dependencia de `typescript-eslint`.

Dos restricciones que parecen arbitrarias pero no lo son:

- **`typescript` se queda en `~5.9.x`.** `typescript-eslint@8` declara `typescript >=4.8.4 <6.1.0`;
  con TypeScript 7 el lint no arranca.
- **Node `^22.12.0 || ^24.0.0 || >=26.0.0`.** Vite 8 todavía admite Node 20, pero `vitest@5` no:
  declarar Node 20 haría imposible `npm run test`.

---

## Commands

| Comando                 | Qué hace                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `npm install`           | Instala dependencias                                             |
| `npm run dev`           | Servidor de desarrollo con HMR                                  |
| `npm run build`         | `vue-tsc -b` (typecheck) + `vite build` → `dist/`                |
| `npm run preview`       | Sirve `dist/` localmente                                        |
| `npm run typecheck`     | `vue-tsc -b --noEmit`. Sin emitir                                |
| `npm run lint`          | `eslint .` — **solo check**, sin `--fix`                         |
| `npm run lint:fix`      | `eslint . --fix`                                                 |
| `npm run format`        | `prettier --write src/`                                          |
| `npm run format:check`  | `prettier --check src/`                                          |
| `npm run test`          | `vitest run` — una sola pasada, sin watch                        |
| `npm run test:watch`    | `vitest` en modo watch                                           |
| `npm run test:coverage` | `vitest run --coverage`, con los umbrales de la constitution IV.1|

`npm run emulators` **todavía no existe**: necesita un runner de procesos en paralelo y eso sería una
dependencia nueva, que §Rules prohíbe sin actualizar la spec. Hasta que se decida, el emulador se levanta
en una terminal con `npx firebase emulators:start` y el frontend en otra con `npm run dev`. Se resuelve en
la fase 13, antes de T91.

`typecheck` y `build` usan `vue-tsc -b`, así que el proyecto **debe** tener *project references*
(`tsconfig.json` referenciando `tsconfig.app.json`, `tsconfig.node.json` y `tsconfig.vitest.json`).
`--noEmit` combinado con `-b` requiere TypeScript ≥ 5.6.

Dos rarezas de esa configuración que **no hay que arreglar**, porque romperían el typecheck:

- `tsconfig.vitest.json` **solapa** con `tsconfig.app.json` en `src/**/*.ts`. Es deliberado. Sin
  solapamiento, un test que importa `@/domain/...` dispara `TS6307`, porque los tests pertenecen al
  proyecto de tests y el fichero importado al de la app, sin referencia entre ambos. La alternativa
  sería referenciar `app` desde `vitest`, y eso da `TS6310`: un proyecto referenciado no puede llevar
  `noEmit`. Como los tres proyectos llevan `noEmit`, no hay colisión de salidas y el solapamiento es
  inocuo. Solo implica que `src/` se comprueba dos veces.
- `tsconfig.vitest.json` **hereda `exclude` de `tsconfig.app.json`** por `extends`. Por eso repite
  `exclude` de forma explícita: si no, hereda el que filtra `src/__tests__` y el proyecto se queda sin
  ficheros.

`lint` y `lint:fix` están separados a propósito: meter `--fix` dentro de `lint` impide usarlo como
paso de verificación. El flat config ignora `dist/`, `coverage/` y `node_modules/` en su bloque
`ignores`.

---

## Architecture

### Estructura de carpetas

```
src/
├── __tests__/     Todos los tests: <módulo>.test.ts y <módulo>.test-d.ts
├── app/           Bootstrap: main.ts, App.vue, router/, pinia.ts, queryCache.ts, firebase.ts
├── components/
│   ├── ui/        Primitivos propios: BaseButton, BaseDialog, BaseTable, BaseSelect,
│   │              BaseInput, BaseSnackbar, BaseCard
│   ├── charts/    Wrappers de Chart.js, uno por tipo de visualización
│   ├── forms/     Formularios de dominio
│   └── layout/    AppShell, AppHeader, AppNav
├── composables/   usePlayers, useSeasons, useGames, useGameTurns,
│                  usePlayerSeasonStats, useRankings
├── data/          *.repository.ts — ÚNICO lugar que importa de firebase/*
├── domain/        types.ts, rules.ts, yaku.ts, handValue.ts, turn.ts, uma.ts,
│                  game.ts, replay.ts, seasons.ts, ranking.ts, stats.ts
├── i18n/          locales/es.ts
├── pages/         DashboardPage, PlayersPage, GamesPage, GameDetailPage, SeasonsPage,
│                  StatsPage, RankingsPage, LoginPage
├── queries/       <dominio>.ts — key factories + defineQueryOptions()
├── stores/        session.ts, preferences.ts
├── styles/        main.css + palette.ts
└── test-utils/    Helpers y mocks compartidos (no son tests)
```

`queries/` envuelve `data/` con la API de `@pinia/colada`: ahí viven las *key factories* y los
`defineQueryOptions()`. Los tests viven únicamente en `__tests__/`; las utilidades, en `test-utils/`.

### Regla de capas

```
pages → components/{layout,forms,charts,ui} → composables → queries → data → firebase
                                                          ↘       ↘
                                                            domain
```

Quién puede importar `domain`:

| Capa                       | ¿Importa `domain/`?             |
| -------------------------- | ------------------------------- |
| `components/ui`            | No. No conoce el dominio        |
| `components/layout`        | No                              |
| `components/forms`, `charts` | Sí: tipos y funciones puras   |
| `pages`                    | Sí: para componer resultados    |
| `composables`, `queries`   | Sí                              |
| `data`                     | Solo `import type`. Nunca funciones de cálculo |
| `domain`                   | No importa nada                 |

Las funciones de `domain` son puras: mismos argumentos, mismo resultado, sin efectos, sin Vue, sin
Firebase, sin DOM.

Reparto de los módulos de dominio:

| Módulo            | Qué resuelve                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `domain/types.ts` | Entidades, uniones de literales e identificadores de marca                   |
| `domain/rules.ts` | Rondas, longitud, mínimo de turnos, renchan, prórroga, rotación de localía, honba |
| `domain/yaku.ts`  | Catálogo de yaku con su han, yaku de límite, reglas de fu y controles verificables |

> **El `han` de un yaku de `category: 'limit'` no se suma nunca.** Es el valor tradicional de
> referencia (`daisangen` = 6, el resto = 13) y está para poder listarlos y mostrarlos, no para
> puntuar. Los yaku de límite valen 8000 puntos y tienen precedencia sobre la fórmula (RF-16.3), y
> `docs/domain.md` §4.5 excluye el doble yakuman. Sumar ese `han` puntuaría un daisangen como
> 6 han y reintroduciría el doble yakuman que la desviación 4 elimina. **Quien sume han debe
> filtrar antes por `category === 'normal'`, o usar `isLimitYaku()`.**
| `domain/handValue.ts` | Valor de una mano: fórmula, precedencia de manos límite, redondeo, pagos, honba |
| `domain/turn.ts`  | Resolución de un turno: deltas, invariante de cuadre, bote de riichi, chombo, bancarrota |
| `domain/uma.ts`   | Uma y punto de retorno                                                       |
| `domain/game.ts`  | Ciclo de vida y resultado final: estados, transiciones, posiciones, desempate |
| `domain/replay.ts` | Recorrido de una partida: estado derivado de cada turno y re-derivación al corregir o borrar |
| `domain/seasons.ts` | Rangos de fechas, solapamientos y asignación de una partida a su temporada |
| `domain/ranking.ts` | Clasificación de temporada y sus desempates                                |
| `domain/stats.ts` | Agregación por jugador y temporada                                            |

Prohibido:

- Importar `firebase/*` fuera de `src/data/` y `src/app/firebase.ts`.
- Llamar a Firestore desde un `.vue`.
- Que un composable dependa de otro composable de entidad. Los datos compartidos se resuelven
  leyendo varias queries de la caché compartida, no encadenando composables.
- Poner cálculos de negocio (uma, ranking, agregaciones) en `.vue`, composables o repositorios.
- Introducir en `domain/handValue.ts` una constante de regla sin su desviación documentada en
  `docs/domain.md §4.5`. Cada desviación del reglamento de referencia cambia puntos reales y necesita
  su test.

### Stores

Pinia queda **reducido a dos stores**, y solo para estado que deba sobrevivir a la navegación:

- `stores/session.ts` — usuario autenticado y estado de la sesión, incluido el acceso con correo y
  contraseña (RF-15.9). No hay un tercer store para el acceso.
- `stores/preferences.ts` — tema, densidad de tabla, última temporada vista, cacheados en
  `localStorage`.

La caché de datos de servidor **no** va en Pinia: la lleva `@pinia/colada`, que deduplica peticiones
en curso y refresca por clave. Eso permite que `usePlayerSeasonStats` y `useRankings` resuelvan
nombres de jugadores sin depender uno del otro.

Reglas de los stores:

- **Nunca consumir `useQuery()` dentro de un store.** La query quedaría *inmortal*: un store nunca
  se destruye, así que su entrada de caché nunca se recolectaría. Si un store necesita leer datos
  cacheados, usa `useQueryCache().getQueryData(key)`.
- Un store no hace E/S. Delega en `queries/` o en `data/`. **Única excepción:** la autenticación,
  que no va por `data/` ni por `queries/` sino por `src/app/firebase.ts`, porque es el único módulo
  además de `src/data/` que puede importar `firebase/*` (V.1). Así `stores/session.ts` delega
  `watchAuthState`, `signInWithEmail` y `signOutSession`, y ninguna otra capa habla con el SDK de
  Auth.
- El store **no fija el estado de sesión por su cuenta**: `signIn` espera al SDK y deja que
  `onAuthStateChanged` marque `authenticated`. Si el store escribiera `status` a mano habría dos
  fuentes de verdad y RF-15.4 dejaría de cumplirse.
- La prueba: si el estado pertenece a una sola pantalla y muere con ella, no es un store.

### Contrato de queries y composables

`queries/` define las claves y opciones; los composables las consumen y nada más:

```ts
// src/queries/players.ts
export const playersKeys = {
  root: ['players'] as const,
  bySeason: (seasonId: SeasonId) => [...playersKeys.root, 'season', seasonId] as const,
}

export const playersBySeasonQuery = defineQueryOptions((seasonId: SeasonId) => ({
  key: playersKeys.bySeason(seasonId),
  query: () => playersRepository.listBySeason(seasonId),
}))
```

Un composable por entidad, exponiendo siempre la misma forma:

```ts
const { data, isLoading, error, refresh } = usePlayers()
```

- Para estrechar tipos hay que leer de `state`, no de los alias sueltos: `state.status` es `'pending'
  | 'success' | 'error'` y estrecha `state.data` y `state.error`. Los `Ref` individuales no estrechan
  bajo `strict`.
- `refresh()` por defecto: reutiliza la caché según `staleTime`. `refetch()` solo si el usuario pide
  datos frescos explícitamente.
- `enabled` para pausar cuando falta el identificador (por ejemplo, sin temporada seleccionada).
- Las escrituras van con `useMutation`: `mutate()` deja el error en `error` sin relanzarlo,
  `mutateAsync()` lo relanza y se usa dentro de `try/catch`. Devuelven la entidad creada o
  actualizada, nunca `void`.
- Tras una escritura, `onSettled` invalida lo afectado:
  `queryCache.invalidateQueries({ key: ['season-stats', seasonId] })`.
- `useQueryCache()` solo dentro de `setup`, de un store o de un guard de navegación: necesita
  contexto de inyección y **no** puede usarse en scope global.

### Contrato de repositorios

Un archivo por colección en `src/data/`:

```ts
export const playersRepository = {
  list: (): Promise<Player[]> => {},
  getById: (id: PlayerId): Promise<Player | null> => {},
  create: (input: CreatePlayerInput): Promise<Player> => {},
  update: (id: PlayerId, patch: UpdatePlayerInput): Promise<Player> => {},
  remove: (id: PlayerId): Promise<void> => {},
  listBySeason: (seasonId: SeasonId): Promise<PlayerSeasonStats[]> => {},
}
```

- Nombres de campo y de función en `camelCase`; nunca `snake_case`.
- IDs con alias de marca (`type PlayerId = string`) para no mezclarlos por error.
- Los repositorios no actualizan estado local ni invalidan caché. Devuelven el resultado y quien
  llama decide.
- `getDb()` se resuelve una vez en `src/app/firebase.ts` e inyecta la instancia; no se llama a
  nivel de módulo en cada archivo.
- Para escritura atómica, `data/batch.ts` crea el `WriteBatch` y las funciones de escritura aceptan
  un `batch?: WriteBatch` opcional. Por defecto usan un batch propio.

### Captura sin conexión

RNF-5 se cumple con la **caché local persistente del SDK de Firebase**, que ya está instalado: no
hace falta service worker, ni cola propia, ni dependencia nueva. `src/app/firebase.ts` inicializa
Firestore con `initializeFirestore(app, { localCache: persistentLocalCache(...) })` en lugar de
`getFirestore(app)`, y no se llama a `getDb()` en el camino de escritura sin comprobar antes que la
persistencia está activa.

Consecuencias que el código tiene que respetar:

- Una escritura sin red se encola y las lecturas posteriores la ven, de modo que **validar un turno
  offline es idéntico a validarlo con red**: `domain/` es puro y lee del mismo modelo.
- El conflicto entre dos dispositivos lo resuelve la regla de turno duplicado: Firestore entrega las
  dos escrituras y el rechazo del `turnNo` repetido es la política de resolución. No hace falta un
  protocolo de merge propio.
- La sesión de Firebase Auth se persiste en `IndexedDB` por defecto, que es lo que sostiene RNF de
  recordar la sesión entre visitas con la aplicación cerrada.
- La caché local **no** exime de la comprobación de sesión: escribir sin sesión iniciada sigue
  siendo imposible aunque haya cobertura.

### Acceso con Firebase Authentication

`src/app/firebase.ts` es también la única costura de autenticación, y expone cuatro cosas: la
instancia de Firestore (`getDb()`), la suscripción al estado (`watchAuthState`), el acceso
(`signInWithEmail`) y el cierre (`signOutSession`). Ninguna otra capa importa `firebase/auth`.

Consecuencias que el código tiene que respetar:

- El acceso es **correo y contraseña** (RF-15.9). La aplicación **no registra cuentas ni gestiona
  credenciales**: el alta se concede fuera del sistema, así que no hay pantalla de alta, ni de
  recuperación, ni de verificación de correo.
- **El fallo de acceso se traduce antes de salir de `app/firebase.ts`.** `signInWithEmail` lanza
  `AuthError` con una causa de `AuthErrorCode` y su `message` es la clave i18n `errors.auth.*`. El
  texto del SDK nunca llega a la interfaz: contiene `user-not-found` o `wrong-password`, que juntos
  convertirían la pantalla en un enumerador de cuentas del club (RF-14.3, RNF-7).
- `AuthErrorCode` y las claves `errors.auth.*` van en el mismo orden. Si se añade una causa, se
  añaden las dos.
- Un rechazo devuelve un único mensaje para cualquier credencial incorrecta, también cuando el
  correo no está dado de alta. El club tiene que comunicar el alta de cuentas por fuera.

---

## Data model

| Ruta                                            | Contenido                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `players/{playerId}`                            | `externalId`, `name`, `active`, `createdAt`, `updatedAt`                                       |
| `seasons/{seasonId}`                            | `title`, `dateFrom`, `dateTo`, `status`, `createdAt`, `updatedAt`                              |
| `games/{gameId}`                                | `seasonId`, `date`, `gameLength`, `ruleset`, `rulesetVersion`, `startPoints`, `status`, `mustFinalize`, `results[]`, `finalizationAudit[]`, `turnAudit[]`, `createdAt`, `updatedAt` |
| `games/{gameId}/turns/{turnNo}`                 | `turnNo`, `wind`, `dealerId`, `honba`, `resultType`, `yaku[]`, `yakuHan`, `yakuHanOverride`, `doraCount`, `fu`, `tenpai[]`, `riichiDeclaredBy[]`, `riichiSticks`, `discarderId`, `chomboId`, `value[]`, `deltas[]`, `capturedBy`, `updatedBy`, `updatedAt`, `isRenchan`, `isFinalTurn`, `audit[]`, `createdAt`, `handContext?`, `winnerHands?` |
| `playerSeasonStats/{playerId}/stats/{seasonId}` | ID = temporada. `playerId`, `seasonId`, `actualPoints`, `gamesPlayed`, `victories`, `positions`, `yakuStats` |
| `rankings/{seasonId}/players/{playerId}`        | ID compuesto. `playerId`, `seasonId`, `points`, `gamesPlayed`, `rank`, `updatedAt`           |

Detalle de los campos estructurados:

- `gameLength: 'tonpuusen' | 'hanchan'`. Un booleano no expresa longitud.
- `ruleset: 'mleague' | 'mahjongSouls'`. Sin *double riichi*: es un no-objetivo explícito.
  `ruleset: 'mleague'` existe en el modelo pero **no admite captura**.
- `rulesetVersion: string`. Versión de las constantes de reglas con las que se calculó la partida.
  Sin ella, cambiar una tabla de puntuaciones reescribe temporadas ya cerradas y RNF-3 no se puede
  cumplir.
- `status: 'open' | 'finalized' | 'unfinished' | 'aborted'`. Los dos últimos son **terminales** y no
  computan en ningún agregado; se distinguen solo por la causa que los produjo.
- `mustFinalize: boolean`. Se activa cuando un turno deja a alguien por debajo de 0: la partida solo
  admite la acción de finalizar y registrar auditoría.
- `finalizationAudit[]`: `{ at, by, action: 'finalize' | 'unfinalize', reason? }`. Es lo que permite
  deshacer la finalización sin reescribir el pasado en silencio.
- `turnAudit[]`: `{ at, by, action: 'delete', turnNo, before }`. Solo recibe los **borrados de turno sin
  turno anterior**: es el único sitio donde el registro sobrevive sin que el propio borrado se lo lleve
  por delante. No es un historial de revisiones de la partida —ese es `finalizationAudit[]`— sino el
  destino de una entrada que no tiene otro hogar.
- `audit[]` en un turno: `{ at, by, action: 'correct', changes: [{ field, from, to, derived }] }`. Cada
  turno afectado por una corrección recibe la suya, incluido el que la ha recibido por re-derivación.
  `derived` distingue lo que recalculó el sistema de lo que cambió una persona. **No lleva campo de
  motivo**: en una corrección de captura el diff ya dice qué pasó. Es de solo anexado, y esa inalterabilidad
  **la garantiza el cliente, no `firestore.rules`**: las reglas conceden escritura autenticada sobre el
  documento completo y no pueden impedir que un array se sobrescriba entero (RF-19.13 de `specs/002`).
- `capturedBy` en un turno es **inmutable**: identifica a quien escribió la versión original. Quién
  corrigió por última vez va en `updatedBy`, y el detalle en `audit[]`.
- `yakuHan` en un turno es **salida**, no entrada: lo calcula el catálogo de yaku. `yakuHanOverride` es el
  ajuste a mano, guardado como **delta** sobre esa suma, para que el total siga siendo derivable y se
  distinga lo que aportó el catálogo de lo que aportó la persona.
- `wind`, `honba` y `dealerId` de un turno son **estado derivado** de los turnos anteriores, no captura.
  Los escribe el recorrido de `domain/replay.ts`. `dealerId` es el campo que **manda en los pagos**: es el
  dealer de ese turno y no el del asiento Este.
- `discarderId` y `chomboId` de un turno son **captura**, no cálculo, pero son los dos campos sin los
  cuales un ron o un chombo guardado no se puede volver a resolver: el recorrido de
  `domain/replay.ts` los necesita para reconstruir la mano y, sin ellos, rechazaría la partida con
  `incompleteTurn`. Los dos son `PlayerId | null` y valen `null` cuando el turno no es de ese tipo —
  un `null` explícito **no** es lo mismo que un dato ausente, y el parche lo distingue con
  `!== undefined` y no con `??`.
- `seasonId: string | null`. Nullable a propósito: la temporada se **deduce de `date`**, y una partida
  cuya fecha no cae en ningún rango se queda sin temporada en lugar de ser inválida. Dos temporadas no
  pueden solaparse, así que la asignación por fecha nunca es ambigua.
- `results[]`: `{ playerId, playerName, seat, finalScore, finalPosition, uma, chombo, bankrupt }`.
  `playerName` es una copia desnormalizada **solo** para renderizar; la identidad real es `playerId`.
- `externalId` en `players`: identificador que aporta el club y que reconoce a un invitado entre
  partidas. Su formato se valida al escribir, porque un identificador mal escrito parte el historial
  en silencio y no hay validación posterior que lo detecte.
- `value[]` en un turno: `{ playerId, han, fu, basicPoints, points, deltas }`, la salida de
  `domain/handValue.ts`. `deltas[]` a nivel de turno es la suma plana de todos los ganadores.
- `deltas[]`: `{ playerId, delta }` como array, no `Record<PlayerId, number>`: indexar un `Record`
  con `noUncheckedIndexedAccess` devuelve `number | undefined`.
- **El documento de `games` no guarda `totalTurns` ni `riichiSticks`**: los dos son lecturas del último
  turno, igual que los contadores de `players`.
- La suma de los `deltas` de un turno **no es cero por construcción**:
  `Σ deltas = −(1000 × riichi declarados − reclamados)`. El bote de riichi sale del marcador sin entrar
  en nadie. El chombo **no aparece en la fórmula** porque su penalización se reparte entre la mesa y es
  neutra en la suma. Validar con `=== 0` rechaza turnos correctos.
- `turns/{turnNo}`: ID como el número del turno en decimal, **sin relleno con ceros** —el turno 1 se llama
  `1`—. El relleno a dos dígitos rompía el orden lexicográfico a partir del turno 100, y ese techo llevaba
  dos revisiones abierto. **El orden lo fija el campo numérico `turnNo`, nunca el identificador del
  documento**: `list()` ordena por `turnNo` y eso basta. La numeración es correlativa y sin huecos.
- `handContext?`: opcional, array de contexto por ganador para RF-31.7. Cada entrada: `{ playerId, isClosedHand, hasKan }`. Solo existe en turnos con resultado de mano (tsumo/ron). Los turnos escritos antes de 004 no lo tienen y se leen como mano cerrada sin kan.
- `winnerHands?`: opcional, desglose por ganador para RF-32.1. Solo existe en ron múltiple. Cada entrada: `{ playerId, yaku[], yakuHan, yakuHanOverride, doraCount, fu }`. Los turnos de un solo ganador o tsumo no lo tienen.
- `positions`: `'1st' | '2nd' | '3rd' | '4th'`, y en `playerSeasonStats` el desglose
  `Record<Position, number>`. `yakuStats`: `riichi`, `dora`, `kan`, `tsumo`, `ron`, `chombo`,
  `haiteiRaoyue`, `rinshanKaihou`, `yakuman`. `yakuman` cuenta **manos** con yaku de límite o 13+ han,
  no yaku de límite: no hay doble yakuman, así que cuatro yaku de límite suman 1.
- `rank` y `positions` son campos distintos a propósito: `positions` es el desglose por posición de
  jugador, `rank` la posición en la tabla de la temporada.
- `actualPoints` y `rankings.points` son **puntuación final con uma**, no el marcador bruto. El uma
  ordena la tabla y puede dejar la puntuación acumulada en negativo.

Reglas del esquema:

- **camelCase** en todos los campos.
- `createdAt` / `updatedAt` como `Timestamp` nativo (`serverTimestamp()`), nunca
  `new Date().toISOString()`.
- Documentos con ID compuesto para no filtrar en cliente: `playerSeasonStats` usa el `seasonId` como
  ID; `rankings` se anida bajo `{seasonId}`.
- El documento de `players` no guarda contadores derivados: son lectura, no escritura.
- Consultas con `where` / `orderBy` reales. Cada índice compuesto requerido se documenta con un
  comentario en el repositorio que lo necesita.
- La asignación de temporada es una **búsqueda por rango** (`dateFrom <= date`, `dateTo >= date`).
  Como los rangos no pueden solaparse, devuelve a lo sumo una temporada, y `seasonId` no lo elige el
  cliente: se deduce en el servidor de datos y se persiste ya resuelto.

### Escritura de las estadísticas derivadas

`playerSeasonStats` y `rankings` son documentos derivados. Se recalculan **en el cliente** tras cada
escritura de partida, de forma atómica:

1. `domain/stats/recalculate.ts` es una función **pura**: recibe `games[]` de una temporada y
   devuelve los documentos a escribir. Idempotente: mismo input, mismo output.
2. El composable de escritura lee las partidas de la temporada, invoca esa función y persiste
   juego + turnos + `playerSeasonStats` + `rankings`.
3. Todo ello en un único `WriteBatch`, de modo que la temporada nunca queda a medio recalcular.
4. `onSettled` invalida `['season-stats', seasonId]` y las claves de `games` afectadas.

El recálculo completo es lo que hace que **deshacer una finalización** no necesite una operación de
reversión: basta con volver a calcular desde `games[]`. Escribe en `rankings` con `actualPoints` y
`points` con uma, según lo definido en `docs/domain.md §5`.

### Reglas de seguridad

`firestore.rules` es parte del modelo, no un extra:

- **Lectura de `players`, `seasons`, `games`, sus `turns` y todos los derivados: pública.** El club es
  público en sus resultados y el visitante no puede escribir nada, así que la lectura no necesita
  autenticación.
- Escritura en `players`, `seasons`, `games` y sus `turns`: autenticado. Sin niveles de permiso.
- Borrado de jugador o temporada: autenticado, **sin claim `admin`**. No hay jerarquía en el club y el
  sistema no la reconoce.
- La sesión persistida de Firebase Auth habilita la lectura pública sin exponer credenciales: se
  comprueba que haya sesión para escribir, no para leer.

**T45 · El registro de correcciones lo garantiza el cliente, no las reglas.** `firestore.rules` no
menciona `audit` en ninguna línea y no debe hacerlo: las reglas no distinguen un campo de otro dentro
de un documento, así que `allow write` concede reescribir `audit[]` entero igual que concede corregir
el marcador. Quien puede corregir un turno **puede** borrar su historial, y en Firestore no hay forma
de impedirlo desde el servidor sin un segundo documento inmutable o reglas por campo que el.rules
formato no permite.

Lo que sostiene la trazabilidad es, por tanto, el cliente, en tres puntos:

1. `data/turns.repository.ts` **añade** a `audit[]` y nunca reescribe sus entradas; `TURN_PATCH_FIELDS`
   es la lista cerrada de lo que `update` sabe cambiar, y ninguna de ellas es `audit`.
2. `useGameTurns` manda `expectedAuditCount` en cada corrección (RF-19.12) y rechaza si el registro
   tiene otra longitud, así que dos correcciones simultáneas no se pisan.
3. `turnsRepository.update` ordena las entradas y `updatedBy`/`updatedAt` los toma de la última.

Consecuencia asumida: un usuario con credenciales de la aplicación y acceso directo al proyecto puede
manipular el historial. El club es cerrado y la finalización reescribe los agregados, así que el riesgo
está acotado, pero **no** es una garantía del servidor. Si algún día hace falta, el camino es un
`audit/{entryId}` aparte con reglas de solo-creación.

> Un test de `firestore.rules.test.ts` fija que las reglas no hablan de `audit`, para que nadie las
> toque creyendo que una de ellas lo protege.

---

## Style and conventions

### Formato

`.prettierrc.json`:

```json
{ "semi": false, "singleQuote": true, "printWidth": 100 }
```

`.editorconfig`: UTF-8, indent 2 espacios, LF, newline final, sin espacios finales,
`max_line_length = 100`.

### Lint

- ESLint 10 flat config, con `ignores` para `dist/`, `coverage/` y `node_modules/`.
- `eslint-plugin-vue` en `flat/recommended`.
- `typescript-eslint` con reglas type-aware.
- `@vue/eslint-config-prettier/skip-formatting` **siempre al final**: Prettier manda sobre las
  reglas de estilo.
- Plugin de Vitest acotado a `src/__tests__/`.

### Tests

- **Todos los tests viven en `src/__tests__/`, ninguno junto al módulo.** La carpeta es la única: no se
  crea una por capa. `src/domain/` contiene solo código.
- Un test se nombra como el módulo que prueba: `src/domain/uma.ts` → `uma.test.ts`. Los helpers y
  mocks compartidos van en `src/test-utils/`.
- **Un test por módulo, y solo uno**: `src/domain/uma.ts` → `uma.test.ts`. Los barridos exhaustivos
  (tabla de puntuación completa, invariante de cuadre, orden de desempate) van **dentro** del test de su
  módulo, en un `describe` propio; no se crea un segundo fichero por barrido.
- Los tests importan con el alias `@/`, nunca en relativo, y quedan excluidos de la cobertura.
- Las aserciones de tipo van en `<módulo>.test-d.ts` y las comprueba `npm run typecheck`, no Vitest.
- Las partidas completas de prueba, reutilizadas por varios módulos, van en `src/__tests__/fixtures/`.
- **La puerta de una especificación que no escribe en `domain/` es otra.** El umbral de
  constitution IV.1 —100 % de `src/domain/`— mide código puro, y una spec de interfaz no lo toca: su
  puerta no puede ser ese porcentaje, porque daría verde siempre. Su puerta es doble: `git diff
  --name-only src/domain` **vacío** —el dominio congelado, medido con `git diff` y no con cobertura— y
  **un test por comportamiento de pantalla**, para que no se añada interfaz sin comprobar. Sin
  escribirlo, la siguiente especificación de interfaz copia la puerta vacía y hereda un criterio que no
  muerde.
- **La puerta de una especificación que SÍ escribe en `domain/` vuelve a ser la de la constitución:**
  100 % de cobertura de `src/domain/` (IV.1) + `git diff --name-only src/domain` **con los cambios
  declarados** y sin cambios extra. 004 lo ilustra: el dominio cambió y la puerta volvió a ser la
  cobertura, no el diff vacío.
- **Esa segunda mitad tiene guardián.** `src/__tests__/trazabilidad.test.ts` lee la lista de RF de
  `specs/003/spec.md` desde el disco y **falla enumerando los RF que ningún test cita**. Un RF
  implementado y marcado `[x]` sin una sola aserción —lo que pasó con RF-26— deja de ser un verde
  silencioso. Un RF cuya comprobación sea una revisión visual acordada se declara con su motivo en el
  mapa `VISUAL_REVIEW` de ese fichero, y el propio test exige que la spec lo declare y que no tenga ya
  un test; si se le escribe uno, el mapa sobra y el test pide retirarlo.

### Naming

| Elemento                          | Convención                      | Ejemplo                           |
| --------------------------------- | ------------------------------- | --------------------------------- |
| Variables, funciones, composables | `camelCase`                     | `usePlayerSeasonStats`            |
| Archivos de lógica                | `camelCase` + sufijo            | `uma.ts`, `players.repository.ts` |
| Tests                             | `<módulo>.test.ts`              | `uma.test.ts`                     |
| Componentes                       | `PascalCase`                    | `PlayerForm`, `StatsBarChart`     |
| Primitivos de UI                  | `PascalCase` con prefijo `Base` | `BaseDialog`, `BaseTable`         |
| Páginas                           | `PascalCase` + sufijo `Page`    | `PlayersPage`                     |
| Tipos, interfaces                 | `PascalCase`                    | `PlayerSeasonStats`               |
| Constantes                        | `SCREAMING_SNAKE_CASE`          | `UMA_VALUES`                      |
| Constantes de i18n                | `camelCase`                     | `playersView.title`               |
| Eventos emitidos                  | `kebab-case`                    | `emit('submit-form')`             |

Una sola forma por categoría.

### Imports

- **Siempre el alias `@/`.** Nada de rutas relativas tipo `../stores/x`. Solo se permite la misma
  carpeta o un `./` cuando el archivo es hermano del importado, y las extensiones se omiten siempre.
- Orden: librerías externas → `@/` → mismo directorio.
- Sin imports agrupados con `* as components` salvo para barrels propios deliberados.

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. El typecheck es
  bloqueante.
- Prohibidos `any`. Cuando haga falta, `unknown` y narrowing explícito. `as` solo con justificación:
  preferir type guards.
- `type` sobre `interface` para datos y unions; `interface` solo para contratos con miembros.
- Todos los campos de una entidad son obligatorios salvo que se marque `?` de forma explícita y con
  motivo. No se declaran opcionales "por si acaso".
- Los valores de enumeración (vientos, tipos de yaku, posiciones, ruleset) son unions de literales,
  nunca `string`.

### Vue

- `<script setup lang="ts">`. Sin Options API. Composables y queries se usan en `<script setup>`,
  nunca en el template.
- Props tipadas con `defineProps<Props>()` y `withDefaults` para los valores por defecto.
  `defineEmits<{ ... }>()` tipado; los eventos usan `kebab-case` en el template.
- **Nunca mutar props.** Estado local derivado con `ref` + `watch` sobre la prop.
- Sin `alert()`, `confirm()`, `prompt()`. Confirmaciones con `BaseDialog`, avisos con
  `BaseSnackbar`. Sin `console.log` / `console.error` en código de aplicación.
- Cada componente de gráfica implementa `onBeforeUnmount` para destruir su instancia.

### Tailwind

- Clases de Tailwind directamente en el `<template>`. `<style scoped>` solo para lo que no se puede
  expresar en utilidades.
- Tokens de color, espaciado y tipografía en el bloque `@theme` de `src/styles/main.css`.
  **Prohibido** escribir colores hexadecimales sueltos en `<style scoped>`.
- **El tema es el único dueño de la paleta.** Ningún componente escribe un color: ni en su
  `<style scoped>` ni en una clase suelta; usa la utilidad del token (`bg-mahjong-surface`,
  `text-mahjong-negative`, `bg-mahjong-positive/10`). `src/__tests__/styles.test.ts` lo comprueba
  con una búsqueda en todos los `.vue` (RF-35.2).
- **Un token cambia de valor, nunca de nombre.** El nombre es la API que consumen los componentes, y
  cambiarlo obliga a tocar todos ellos; el valor sí es desechable (spec §9.2, decisión 10 del plan).
- Tema **dark** como único tema soportado, con su variable de conmutación preparada en `@theme`.
- Variantes de componente declaradas como tabla (patrón `cva`) en vez de condicionales dispersos en
  el template.

### Gráficas (Chart.js)

El MVP incluye tres visualizaciones, fijadas por RF-17: evolución de la puntuación acumulada por
partida, desglose de posiciones y yaku más frecuentes. chart.js está en el stack por eso, no por
anticipación.

- Todo en `components/charts/`, un componente por visualización. Los datos llegan por props ya
  tipadas; el componente no consulta nada.
- **Las gráficas no pueden tener una fuente de datos propia**: se construyen con lo mismo que
  alimenta las tablas de estadísticas, de modo que no puedan discrepar de ellas.
- Responsive con `responsive: true` y contenedor de altura definida en clases.
- Paleta de series definida una vez en `src/styles/palette.ts`, no re-declarada por componente.
- Umbrales y colores condicionales como constantes con nombre, nunca literales en el `render`.

### i18n

- `vue-i18n` con `es` como único locale y por defecto.
- **Prohibido** texto de UI literal en templates, atributos o `aria-label`. Las claves se agrupan por
  dominio: `playersView.*`, `gamesView.*`, `statsView.*`, `errors.*`, `uma.*`, `yaku.*`,
  `handValue.*`.
- Formatos numéricos y fechas **siempre** por i18n (`$n`, `$d`), nunca `toFixed` / `toLocaleString`
  directos en un componente.
- Los términos de Mahjong se mantienen sin traducir: riichi, dora, hanchan, uma, tsumo, ron, kan,
  yakuman.

### Errores

- Los repositorios lanzan; `@pinia/colada` expone el `Error` capturado. `error` es un `Error`, no un
  string.
- El mensaje apto para el usuario sale de **i18n**: cada query declara `meta.errorMessage` con una
  clave (`errors.load.players`), y `PiniaColadaQueryHooksPlugin` la muestra en el `BaseSnackbar`.
  No se concatenan cadenas en español dentro del código.
- Ningún error se traga sin exponerlo, y nunca hay un `catch` vacío. Un refetch fallido conserva el
  `data` anterior: se puede mostrar caché + aviso de error sin vaciar la pantalla.
- **Los rechazos de validación de un turno son errores de negocio, no de red**: cada uno tiene su
  clave (`errors.turn.notSquare`, `errors.turn.noYaku`, `errors.turn.notRepresentable`,
  `errors.turn.windYaku`, `errors.turn.chiiFu`, `errors.turn.duplicateNumber`,
  `errors.turn.gapInSequence`, `errors.turn.rulesetUnsupported`) y se muestran junto al formulario de
  captura. Un rechazo nunca se resuelve con un mensaje genérico de «error al guardar».

### Idiomas

- Textos de UI y comentarios en **español**.
- Identificadores (variables, funciones, tipos, archivos) en **inglés**.

---

## Rules

- Lee `docs/constitution.md` y la spec activa en `specs/` antes de tocar código.
- **Lee también el plan técnico de esa spec** (`specs/<id>/plan.md`) antes de implementar: fija el orden
  de fases, el reparto de módulos y la estrategia de tests, y sus decisiones llevan la alternativa
  descartada. Si el plan y esta documentación se contradicen, gana esta documentación y hay que corregir el
  plan.
- **Trabaja con `specs/<id>/tasks.md`**: cada tarea trae los RF que cubre y un «hecho cuando» verificable.
  Una tarea se marca solo cuando su condición se cumple, y `grep -c '^- \[ \]'` dice qué queda. Las
  tareas van en orden de dependencias.
- No añadas dependencias ni cambies el formato del JSON sin actualizar antes la spec.
- No modifiques archivos dentro de `specs/` salvo petición explícita.

## Al terminar cualquier tarea

Verificación obligatoria (constitution III.1). Los cuatro en verde, en este orden:

```
npm run typecheck && npm run lint && npm run test && npm run format:check
```

- `lint` es solo check, nunca muta archivos. Para corregir automáticamente: `npm run lint:fix`.
- `npm run test:coverage` aplica los umbrales de cobertura de la constitution IV.1: 100 % de líneas,
  ramas y funciones sobre `src/domain/`, excluyendo los ficheros de test.
- Si alguno falla y la causa no está en el cambio, decirlo explícitamente en la respuesta en lugar de
  ocultarlo.
