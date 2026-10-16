# plan.md — Plan técnico de `specs/001`

Plan de construcción del MVP de MahjongBuClub a partir de [`spec.md`](spec.md). Este documento define
**cómo** se construye; la spec define **qué** se construye. Las rutas de este documento son relativas a
`specs/001/`.

| Documento | Papel |
| --------- | ----- |
| [`../../docs/constitution.md`](../../docs/constitution.md) | Principios no negociables. Se cita como `N.M`. |
| [`spec.md`](spec.md) | 129 requisitos en RF-0 a RF-17, 49 casos límite, 23 criterios de finalización. |
| [`../../docs/domain.md`](../../docs/domain.md) | Reglas de puntuación: valor de mano, uma, riichi, chombo, bancarrota. |
| [`../../docs/reviews/001-qa.md`](../../docs/reviews/001-qa.md) | Traza de los 110 hallazgos de la revisión y dónde se cerraron. |
| [`../../AGENT.md`](../../AGENT.md) | Convenciones de software. Este plan no puede contradecirlas. |
| `plan.md` | Este documento. |

---

## 1. Alcance y forma de trabajo

Se implementa el MVP completo. No hay código heredado que conservar ni migrar.

El orden no es libre. Cuatro reglas lo imponen:

- **Constitution V.1**: todo cálculo vive en `domain/`, que es puro. Ningún `.vue`, composable o
  repositorio calcula reglas de negocio. Por eso `domain/` se escribe **primero y entero** y la interfaz
  se limita a recoger entradas y pintar salidas.
- **Constitution IV.1**: cobertura del 100 % de líneas, ramas y funciones en `domain/`. Los módulos
  nuevos entran con el umbral puesto, no con deuda inicial.
- **Constitution IV.2**: una función pura nueva sin test es trabajo incompleto. Se escribe el test antes
  que la función.
- **RF-16.2**: los deltas de un turno se derivan del valor de la mano. Si el motor no está antes que la
  pantalla de captura, esa pantalla no se puede construir.

`../../docs/constitution.md` **no se toca**: ningún principio necesita enmienda. Ninguna dependencia se añade,
así que `../../AGENT.md` → Rules se respeta sin excepción (II.1, II.2).

## 2. Orden de ejecución

| Fase | Contenido | Por qué aquí |
| --- | --- | --- |
| 0 | Andamiaje: `package.json`, `tsconfig` con *project references*, flat config de ESLint, `.prettierrc.json`, `.editorconfig`, config de Vitest con umbrales | `typecheck` y `lint` no existen sin esto (constitution III.1) |
| 1 | `domain/types.ts` | Todo lo demás importa de aquí |
| 2 | `domain/yaku.ts` | Validación de yaku y reglas de fu; prerequisite del motor |
| 3 | `domain/handValue.ts` | Núcleo del cálculo. Es lo que hace verdad RF-16 |
| 4 | `domain/turn.ts` | Deltas, invariante, bote de riichi, chombo, bancarrota |
| 5 | `domain/rules.ts` | Mínimo de turnos, renchan, honba, rotación de localía |
| 6 | `domain/uma.ts` y `domain/game.ts` | Resultado final de la partida |
| 7 | `domain/seasons.ts` | Rangos y asignación por fecha |
| 8 | `domain/ranking.ts`, `domain/stats.ts`, `domain/stats/recalculate.ts` | Agregados |
| 9 | `data/`, `queries/`, `composables/` | Capa de acceso, con `domain/` ya probado |
| 10 | `stores/`, `components/`, `pages/` | Estado de sesión e interfaz |
| 11 | `firestore.rules`, `firebase.json`, índices compuestos | Última capa: las reglas dependen del modelo definitivo |
| 12 | Verificación constitution III.1 | `typecheck` → `lint` → `test` → `format:check` |

**Fuera del alcance de las fases 1 a 12:** M.League, el registro de las fichas de la mano, el
rating o ELO, exportar e importar, y las notificaciones. Ver `spec.md` §7.

## 3. Módulos

### 3.1 `domain/` — puro, sin Vue, sin Firebase, sin DOM, 100 % de cobertura

| Módulo | Responsabilidad | RF que cubre |
| --- | --- | --- |
| `types.ts` | Entidades, IDs con marca, uniones de literales, validación de identidad de jugador | RF-0.1, RF-0.5, RF-0.7, RF-1.8, RF-1.9, RF-2.4, RF-2.6, RF-3.12 |
| `rules.ts` | Longitud, mínimo de turnos, renchan, honba, rotación de localía, prórroga | RF-2.6, RF-9.1, RF-9.2 |
| `yaku.ts` | Catálogo de yaku con su han, yaku de límite, reglas de fu, controles verificables | RF-4.3, RF-4.5, RF-4.6, RF-12.4, RF-16.6 |
| `handValue.ts` | Fórmula, precedencia de manos límite, redondeo, pagos, honba, tabla | RF-16.1, RF-16.2, RF-16.3, RF-16.4, RF-16.5 |
| `turn.ts` | Resolución del turno por tipo de resultado: deltas, invariante de cuadre, bote de riichi, bancarrota | RF-3.3, RF-4.1, RF-4.7, RF-5.1 a RF-5.5, RF-6.1 a RF-6.5, RF-7.2, RF-8.8 |
| `uma.ts` | Tabla de uma y punto de retorno | RF-8.4, RF-8.5, RF-8.6 |
| `game.ts` | Ciclo de vida y resultado final: estados, transiciones, posiciones, desempate | RF-0.1 a RF-0.4, RF-8.1 a RF-8.8, RF-9.1 a RF-9.3 |
| `seasons.ts` | Rangos de fechas, solapamientos, asignación por fecha, estado | RF-0.5, RF-0.6, RF-11.1 a RF-11.6 |
| `ranking.ts` | Clasificación de temporada y desempate | RF-13.1 a RF-13.4, RF-13.6 |
| `stats.ts` | Agregación por jugador y temporada | RF-12.1 a RF-12.4, RF-12.8 |
| `stats/recalculate.ts` | Documentos derivados desde `games[]`, idempotente | RF-0.2, RF-9.5, RF-9.6, RF-12.7 |

`game.ts` va aparte de `rules.ts` porque `rules.ts` es determinista y no conoce los deltas, mientras que
el resultado final sí los necesita. Colapsarlos en un módulo obligaría a `rules.ts` a importar de `turn.ts`.

### 3.2 `data/` — único lugar que importa de `firebase/*`

| Repositorio | Contenido | RF |
| --- | --- | --- |
| `players.repository.ts` | `list`, `create`, `update`, `remove`, `findByExternalId` | RF-1.1 a RF-1.9, RF-0.7 |
| `seasons.repository.ts` | `list`, `create`, `update`, `close`, `findByDateRange`, `findOverlapping` | RF-11.1 a RF-11.7, RF-0.5, RF-0.6 |
| `games.repository.ts` | `listBySeason`, `listOpen`, `getById`, `create`, `update`, `remove` | RF-2.1 a RF-2.9, RF-0.1, RF-9.3 |
| `turns.repository.ts` | `list`, `create`, `update`, `nextNumber` | RF-3.1 a RF-3.14 |
| `playerSeasonStats.repository.ts` | Derivado: `listBySeason`, `replaceForSeason` | RF-12.1 a RF-12.8 |
| `rankings.repository.ts` | Derivado: `listBySeason`, `replaceForSeason` | RF-13.1 a RF-13.7 |
| `batch.ts` | `WriteBatch` compartido para toda escritura atómica | RF-9.5, RF-9.6 |

Ningún repositorio calcula reglas de negocio. Cuando una escritura necesita el mínimo de turnos, el uma o
el valor de una mano, su firma recibe el valor **ya calculado** desde `domain/`.

### 3.3 `queries/` y `composables/`

`*Keys` y `defineQueryOptions()` en `queries/`; los composables consumen y nada más. Un composable por
entidad, exponiendo siempre `{ data, isLoading, error, refresh }` más sus mutaciones.

| Ficheros | Contenido | RF |
| --- | --- | --- |
| `queries/players.ts` · `usePlayers` | Consulta, alta y baja de jugadores | RF-1.x, RF-0.7 |
| `queries/seasons.ts` · `useSeasons` | Consulta, creación y cierre de temporadas | RF-11.x, RF-0.5 |
| `queries/games.ts` · `useGames` | Consulta, creación, finalización y deshacer | RF-2.x, RF-9.x, RF-10.x, RF-0.x |
| `queries/turns.ts` · `useGameTurns` | Consulta, registro y corrección de turnos | RF-3.x, RF-4.x |
| `queries/playerSeasonStats.ts` · `usePlayerSeasonStats` | Derivados, solo lectura | RF-12.x |
| `queries/rankings.ts` · `useRankings` | Derivados, solo lectura | RF-13.x |

Ningún composable depende de otro composable de entidad. Los nombres de los jugadores se resuelven
leyendo varias claves de la caché compartida, no encadenando composables.

El narrowing se hace siempre desde `state.status` (constitution VI.2).

### 3.4 `stores/` — dos, ni uno más (constitution V.2)

- `session.ts`: usuario autenticado y estado de la sesión. RF-15.1 a RF-15.5.
- `preferences.ts`: tema, densidad de tabla y última temporada vista, que es lo que hace cumplir RF-13.7.
  Cacheado en `localStorage`.

Ninguno consume `useQuery()`: la entrada de caché quedaría inmortal. El borrador del turno en curso
(RF-15.8) va en `localStorage` desde el composable, no en un store, porque pertenece a una sola pantalla y
muere con ella.

### 3.5 `components/` y `pages/`

| Pieza | RF |
| --- | --- |
| `components/ui/`: `BaseButton`, `BaseDialog`, `BaseInput`, `BaseSelect`, `BaseTable`, `BaseCard`, `BaseSnackbar` | Ninguno: no importan de `domain/` |
| `components/layout/`: `AppShell`, `AppHeader`, `AppNav` | RF-14.4 |
| `components/forms/GameForm` | RF-2.1 a RF-2.9 |
| `components/forms/TurnForm` | RF-3.10, RF-3.12, RF-3.13, RF-3.14, RF-4.x, RF-15.7, RF-15.8 |
| `components/forms/PlayerForm` | RF-1.2, RF-1.8, RF-1.9 |
| `components/forms/SeasonForm` | RF-11.1, RF-11.2, RF-11.3 |
| `components/charts/PointsEvolutionChart` | RF-17.1 |
| `components/charts/PositionsChart` | RF-17.2 |
| `components/charts/YakuChart` | RF-17.3 |
| `pages/DashboardPage` | RNF-4 |
| `pages/GamesPage`, `pages/GameDetailPage` | RF-2.x, RF-3.x, RF-4.x, RF-9.x, RF-10.x |
| `pages/PlayersPage` | RF-1.x |
| `pages/SeasonsPage` | RF-11.x |
| `pages/StatsPage`, `pages/RankingsPage` | RF-12.x, RF-13.x, RF-17.x |
| `pages/LoginPage` | RF-14.3, RF-15.4 |

Las tres gráficas se alimentan **de las mismas consultas que las tablas** (RF-17.4): no existe una fuente
de datos paralela para ellas.

`GameDetailPage` es la pantalla de captura, el punto donde se cumple HU-2. `RankingsPage` está separada de
`StatsPage` porque RF-13.7 exige una temporada elegida y RF-12 exige estadísticas de un jugador: son dos
lecturas con selectores distintos.

## 4. Modelo de datos

### 4.1 Colecciones

```
players/{playerId}
  externalId: string          identificador que aporta el club
  name: string
  active: boolean             RF-0.7
  createdAt / updatedAt: Timestamp

seasons/{seasonId}
  title: string
  dateFrom: Timestamp         día civil, inicio inclusivo
  dateTo: Timestamp           día civil, fin inclusivo
  status: 'open' | 'closed'   RF-0.5
  createdAt / updatedAt

games/{gameId}
  seasonId: string | null     se deduce de `date`; null si no cae en ningún rango (RF-11.6)
  date: Timestamp
  gameLength: 'tonpuusen' | 'hanchan'
  ruleset: 'mahjongSouls' | 'mleague'
  rulesetVersion: string      RNF-3
  startPoints: number         25000
  status: 'open' | 'finalized' | 'unfinished' | 'aborted'      RF-0.1
  mustFinalize: boolean       RF-0.4
  results[]: { playerId, playerName, seat, finalScore, finalPosition, uma, chombo, bankrupt }
  finalizationAudit[]: { at, by, action: 'finalize' | 'unfinalize', reason? }        RF-9.4
  createdAt / updatedAt

games/{gameId}/turns/{turnNo}          turnNo con relleno a dos dígitos
  turnNo, wind, dealerId, honba
  resultType: 'tsumo' | 'ron' | 'ryuukyoku' | 'chombo'
  yaku[], yakuHan, doraCount, fu
  tenpai[], riichiDeclaredBy[]
  riichiSticks: number                 bote después de resolver el turno
  value[]: { playerId, han, fu, basicPoints, points, deltas }   salida del motor
  deltas[]: { playerId, delta }
  capturedBy                           RNF-2
  isRenchan, isFinalTurn, createdAt

playerSeasonStats/{playerId}/stats/{seasonId}
  playerId, seasonId
  actualPoints: number      suma de puntuación final con uma; puede ser negativa (RF-12.8)
  gamesPlayed, victories
  positions: { '1st': n, '2nd': n, '3rd': n, '4th': n }
  yakuStats: { riichi, dora, kan, tsumo, ron, chombo, haiteiRaoyue, rinshanKaihou, yakuman }

rankings/{seasonId}/players/{playerId}
  playerId, seasonId
  points: number            con uma (RF-13.1)
  gamesPlayed, rank, updatedAt
```

### 4.2 Índices compuestos requeridos

| Índice | Para qué | RF |
| --- | --- | --- |
| `games`: `status ASC, updatedAt DESC` | Partidas abiertas y las que superan los 7 días sin actividad | RF-10.4, RF-10.5 |
| `games`: `seasonId ASC, date DESC` | Partidas de una temporada en orden cronológico | RF-12.5, RNF-8 |
| `games`: `date DESC` | Histórico global | RNF-8 |
| `seasons`: `dateFrom ASC, dateTo ASC` | Detectar solapamiento y buscar la temporada de una fecha | RF-11.2, RF-11.5 |
| `rankings`: `rank ASC` | Ordenar la clasificación | RF-13.1 |

Cada uno lleva su comentario en el repositorio que lo necesita, como exige `../../AGENT.md`.

### 4.3 Escritura

Una mutación, un `WriteBatch`. Registrar un turno escribe el turno, y si la partida está `finalized`
reescribe `playerSeasonStats` y `rankings`. Finalizar o deshacer escribe el juego, su auditoría y los
documentos derivados.

El recálculo completo desde `games[]` es lo que hace que **deshacer** no necesite una operación de
reversión (RF-9.5): basta con recalcular. Es idempotente, y por eso RNF-3 es comprobable con un test.

### 4.4 Reglas de seguridad

Lectura pública en `players`, `seasons`, `games`, sus `turns` y todos los derivados. Escritura
autenticada, sin niveles de permiso y **sin claim `admin`** (RF-15.2, RF-15.5). Lo que sostiene RF-15 es
que escribir exige sesión, no leer.

## 5. Decisiones justificadas con la alternativa descartada

Las doce que más condicionan el código. Cada una lleva lo que se habría hecho en su lugar, por qué no, y
el riesgo que queda asumido.

| # | Decisión | Alternativa descartada | Por qué | Riesgo asumido |
| --- | --- | --- | --- | --- |
| 1 | El sistema calcula el valor de la mano | Que quien captura introduzca los puntos y el motor solo avise si el número es inverosímil | Con los puntos tecleados el motor no añade nada: es el error de siempre con un formulario delante. RF-16.2 | El recuento de dora no es verificable sin las fichas. Declarado en `spec.md` §7 |
| 2 | Los deltas se derivan del valor de mano y nunca se teclean | Teclear deltas y usar `handValue` solo como verificación | Si el delta es entrada, la validación es tautológica y el motor queda como adorno | Ninguno: es la única forma de que RF-16.1 signifique algo |
| 3 | El chombo es un delta de −8000 en su turno y no interrumpe la partida | (a) Que el abandono aborte la partida; (b) penalización solo en `results[]` al finalizar | (a) pierde los resultados de una partida jugada entera y hace el contador `chombo` inalcanzable; (b) saca el castigo de la traza turno a turno, que es lo que RNF-2 exige | La suma de la partida es 92 000 y no 100 000. Declarado en RF-7.5 y `../../docs/domain.md §5` — **SUPERADA**, ver nota de abajo |
| 4 | La bancarrota termina la partida y **computa** en el ranking | (a) Permitir saldo negativo; (b) recortar al saldo disponible; (c) acabar como inconclusa | (a) deja seguir jugando con un jugador bajo cero, que el reglamento no contempla; (b) hace que la penalización dependa del estado previo y obliga a reescribir «8000»; (c) tira una partida casi entera | El saldo negativo solo existe como valor terminal. `mustFinalize` bloquea turnos nuevos mientras tanto |
| 5 | `abortada` es terminal | (a) Recuperable al registrar los turnos que faltan; (b) simple rechazo sin estado | El argumento de §1 de la spec es que forzar un cierre produce datos inventados; (a) deja el mismo camino abierto por el otro lado | **Un clic accidental en finalizar condena la partida para siempre.** Mitigación: RF-9.1 exige confirmación previa |
| 6 | El desempate dentro de la partida es por asiento, de Este a Norte | (a) Alfabético por nombre; (b) repartir el uma entre los empatados | Con el uma puntuando, el empate del bruto decide entre +30 y +10: hasta 20 000 puntos. (a) hace depender el resultado de cómo se escribieron los nombres y choca con RNF-1; (b) produce umas que no son del reglamento y rompe el criterio de ejemplo único | En toda partida empatada el asiento de Este va por delante. Es arbitrario, pero declarado y estable |
| 7 | El uma puntúa en la clasificación de temporada | Que el uma sea informativo y la tabla sume el marcador bruto | Si no puntúa, todo RF-8.4 es decorativo y el ranking no refleja el resultado de la partida | `actualPoints` y `points` pueden quedar negativos; documentado en `../../docs/domain.md §5` |
| 8 | La temporada se deduce de la fecha, sin elección, y el solapamiento se rechaza | (a) Asignación manual con aviso si la fecha no encaja; (b) Por fechas con desempate ante solapamiento | (b) es incompatible con que dos temporadas compartan fechas a propósito; permitir el solapamiento y exigir unicidad no pueden coexistir | Crear una temporada solapada pasa de ser una opción «intencional» a un error |
| 9 | No se aplica kiriage mangan | Aplicarlo: 4 han 30 fu y 3 han 60 fu cuentan como mangan | Es la variante del club y venía coherente en cuatro celdas del material aportado | 300 puntos por mano afectada. Desviación nº 1 de `../../docs/domain.md §4.5`, con test propio |
| 10 | No hay doble yakuman, y 13 han normales sí es yakuman | (a) Dobles para suucha riichi, suukantsu y daisuushii; (b) 13 han sigue siendo sanbaiman | El material solo traía un nivel. (a) puntúa cuatro riichi como un kokushi; (b) contradice el propio dato | Una mano con cuatro yaku de límite puntúa como uno. El contador `yakuman` cuenta manos, no yaku |
| 11 | El double riichi no se reconoce | Incluirlo en la lista de yaku con sus 2 han | `../../AGENT.md` y `../../docs/domain.md` lo declaraban no-objetivo; mantenerlo evita tocar dos documentos por una decisión de captura | 1 han menos en esas manos. Desviación nº 3 |
| 12 | RNF-5 con la caché local persistente de Firestore | (a) Cola propia con service worker e IndexedDB; (b) reducir RNF-5 a tolerancia a cortes | El SDK instalado ya trae la caché persistente: cero dependencias nuevas y por tanto sin conflicto con `../../AGENT.md` → Rules. (b) devuelve al club a la memoria cuando falla la red, que es justo lo que RNF-5 quiere evitar | El conflicto entre dos dispositivos lo resuelve el rechazo del turno duplicado: una de las dos capturas se pierde. Declarado en RF-15.6 |

### 5.2 Corrección posterior de la decisión 3 (chombo)

La decisión 3 de arriba estaba bien razonada **para un chombo que no se reparte**, pero partía de que
los 8000 no tenían a quién pagar. El reglamento de referencia sí lo tiene, así que la decisión
repartió el castigo a destiempo: un infractor perdía 8000 y la partida perdía 8000, cuando lo correcto
es que la mesa los cobre. El club confirmó además dos cosas que 001 dio por buenas: **la localía no rota**
y **el contador no se toca**.

Superada y sustituida por las decisiones 28, 29 y 30 de `spec.md` §6, que reescriben **RF-4.1**, **RF-7.2**
a **RF-7.8** y los casos 24 y 50 a 52. Lo que **no** cambia: el chombo se aplica en su propio turno y no
interrumpe la partida.

Lo que arrastró la corrección, y que estaba repartido por más sitios de los previstos:

- `checkSquare` pierde el término del chombo: la penalización se conserva y es neutra en la suma.
- `docs/domain.md` §5 «Conservación de los puntos» se queda con **un** motivo en vez de dos, y
  `../../AGENT.md` deja de advertir que «ni el bote de riichi ni el chombo van a ningún jugador».
- El mensaje de rechazo al capturar un turno descuadrado (`src/i18n/locales/es.ts`) ya no menciona los
  chombos.
- `results[].chombo` se pasa a leer del infractor del turno. Antes se deducía de «quién aparece entre sus
  deltas», que solo funcionaba porque el infractor era el único en cobrarlos; al repartir, **los cuatro**
  habrían quedado marcados como chombo en las estadísticas del club.

### 5.1 Decisiones de estructura de código

| # | Decisión | Alternativa descartada | Por qué |
| --- | --- | --- | --- |
| 13 | `domain/game.ts` como módulo propio | Colapsarlo en `rules.ts` | `rules.ts` es determinista y no conoce los deltas; el resultado final sí. Unirlos obligaría a `rules.ts` a importar de `turn.ts` |
| 14 | `GameDetailPage` y `RankingsPage` separadas | Plegar la captura en `GamesPage` y el ranking en `StatsPage` | RF-13.7 exige temporada elegida y RF-12 exige jugador: son dos lecturas con selectores distintos. La captura merece pantalla propia porque es el flujo de HU-2 |
| 15 | Un test por módulo, con los barridos dentro | Un segundo fichero por barrido, del tipo `handValue.tables.test.ts` | `../../AGENT.md` exige un test nombrado como el módulo; un `describe` propio cumple lo mismo sin multiplicar ficheros |

## 6. Estrategia de tests

### 6.1 Niveles y umbrales

| Nivel | Qué cubre | Umbral |
| --- | --- | --- |
| `src/__tests__/<módulo>.test.ts` | Una función pura por test | **100 % líneas, ramas y funciones** (constitution IV.1) |
| `src/__tests__/<módulo>.test-d.ts` | Tipos, IDs con marca y uniones de literales | Los comprueba `typecheck`, no Vitest |
| `src/__tests__/fixtures/` | Partidas completas reutilizables | — |
| `src/__tests__/*.test.ts` de componentes | Validación de formularios y render de gráficas | Sin umbral, se reporta |
| `src/__tests__/*.test.ts` de `data/` | Repositorios con Firestore simulado | Sin umbral, se reporta |
| `src/__tests__/rules.test.ts` | `firestore.rules` contra el emulador | Sin umbral, se reporta |

El único umbral bloqueante es el de `domain/`, tal como fija constitution IV.1. El resto se reporta sin
bloquear.

**Un fichero de test por módulo.** Los barridos exhaustivos van dentro, en un `describe` propio.

### 6.2 Los cuatro barridos que más valor dan

Son tests de invariante, no de ejemplo. barren combinaciones en vez de comprobar casos sueltos.

| `describe` | Qué barre | Por qué |
| --- | --- | --- |
| `handValue.test.ts` → `'tabla de puntuación'` | Las 100 celdas de las dos tablas de `../../docs/domain.md`, recalculadas desde `fu × 2^(2 + totalHan)` con redondeo por pagador. Las filas `N/A` se comprueban contra su razón: pinfu solo por tsumo, chiitoitsu por tsumo con menzen tsumo | El fallo más caro posible es una celda mal escrita en la tabla, porque nadie lo detecta leyendo el histórico |
| `turn.test.ts` → `'invariante de cuadre'` | Cada `resultType` × localía × número de ganancias × presencia de riichi y chombo. Comprueba `Σ deltas = −(1000 × riichi declarados) − (8000 × chombos)` | Es RF-4.1 leído al revés: si la fórmula está mal, el barrido la encuentra |
| `ranking.test.ts` → `'desempate'` | Empates con y sin victorias y con y sin segundas, y casos de empate total | El orden de RF-13.3 tiene que ser **total y estable**: sin eso dos temporadas no son comparables |
| `recalculate.test.ts` → `'idempotencia'` | Recalcular dos veces sobre las mismas partidas devuelve lo mismo | Es RNF-3 y la condición que hace segura la finalización deshecha de RF-9.5 |

### 6.3 Tests de determinismo y de reproducción

| Test | Qué comprueba | RF |
| --- | --- | --- |
| `handValue.test.ts` → `'determinismo'` | El mismo input produce el mismo output con los objetos en distinto orden de claves | RF-16.5, RNF-1 |
| `recalculate.test.ts` → `'idempotencia'` | Recalcular dos veces las mismas partidas devuelve lo mismo, que es la condición que hace segura la finalización deshecha | RNF-3, RF-9.5 |

**Lo que este plan declaraba y no se ha implementado.** Se retiran dos filas que aquí decían
`game.test.ts` → `'reproducción'` y `game.test.ts` → `'resultado sin red'`: **ninguno de los dos
`describe` existe**. La conclusión honesta es que la parte de RNF-1 y RNF-3 que exige variar
capturador, dispositivo o red no tiene test, y que RNF-5 (`captura sin conexión`) se comprueba
hoy solo por el cableado del SDK (`firebase.test.ts` → `initializeFirestore` con
`persistentLocalCache`), no por comportamiento. Cubrirlo exige un test que simule la pérdida de
red, no una aserción de configuración.

### 6.4 Fixtures

En `src/__tests__/fixtures/` hay **una** de las cuatro declaradas: `temporadaCompleta.ts`. Las
otras tres (`tonpuusenSencilla`, `hanchanConTodo`, `partidaConChombo`) no se han creado; los tests
que las necesitarían construyen sus turnos en línea, así que su ausencia no deja ningún requisito
sin cubrir, pero deja sin ejercitar la partida completa con reparto de riichi que pedía el
criterio 7 de la spec.

### 6.5 Verificación por tarea

Al terminar cada tarea, los cuatro en verde y en este orden (constitution III.1):

```
npm run typecheck && npm run lint && npm run test && npm run format:check
```

Antes de cerrar la fase 8: `npm run test:coverage`, que tiene que dar 100 % en `src/domain/` o la tarea
se declara incompleta. Un fallo ajeno al cambio se declara en la respuesta; no se oculta ni se salta un
paso.

## 7. Trazabilidad RF → módulo → test

**La columna `Test` es una declaración de intención, no una verificación.** Una auditoría
requisito por requisito (2026-10-08) comprobó las 131 filas contra el código y encontró que
muchas se cumplen solo de forma indirecta: el test citado existe y pasa, pero comprueba el
comportamiento por otra vía o lo hace solo en el dominio, no en la interfaz. Antes de dar una
tarea por cerrada hay que abrir el test y confirmar que la aserción existe.

| RF | Módulo o capa | Test |
| --- | --- | --- |
| RF-0.1 a RF-0.4 | `domain/game.ts` | `game.test.ts` |
| RF-0.5, RF-0.6 | `domain/seasons.ts` | `seasons.test.ts` |
| RF-0.7 | `domain/types.ts`, `data/players.repository.ts` | `types.test.ts` |
| RF-1.1 a RF-1.7 | `data/players.repository.ts` | `players.repository.test.ts` |
| RF-1.8, RF-1.9 | `domain/types.ts` (validación de identidad) | `types.test.ts` |
| RF-2.1 a RF-2.9 | `data/games.repository.ts`, `components/forms/GameForm` | `games.repository.test.ts`, `GameForm.test.ts` |
| RF-3.1, RF-3.2 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-3.3 | `domain/turn.ts` | `turn.test.ts` |
| RF-3.4 a RF-3.7 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-3.8 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-3.9, RF-3.10 | `composables/useGameTurns`, `components/forms/TurnForm` | `TurnForm.test.ts` |
| RF-3.11 | `domain/game.ts` | `game.test.ts` |
| RF-3.12 a RF-3.14 | `components/forms/TurnForm`, `domain/turn.ts` | `TurnForm.test.ts`, `turn.test.ts` |
| RF-4.1 | `domain/turn.ts` | `turn.test.ts` → `'invariante de cuadre'` |
| RF-4.2 | `domain/turn.ts` | `turn.test.ts` |
| RF-4.3 | `domain/yaku.ts` | `yaku.test.ts` |
| RF-4.4 | `domain/handValue.ts` | `handValue.test.ts` → `'tabla de puntuación'` |
| RF-4.5 | `domain/yaku.ts` | `yaku.test.ts` |
| RF-4.6 | `domain/yaku.ts` | `yaku.test.ts` |
| RF-4.7 | `domain/turn.ts` | `turn.test.ts` |
| RF-4.8 | `components/forms/TurnForm` | `TurnForm.test.ts` |
| RF-5.1 a RF-5.5 | `domain/turn.ts` | `turn.test.ts` |
| RF-5.6 | `composables/useGameTurns` | `turns.repository.test.ts` |
| RF-5.7 | `domain/game.ts` | `game.test.ts` |
| RF-6.1 a RF-6.4 | `domain/turn.ts` | `turn.test.ts` |
| RF-6.5 | `domain/turn.ts` | `turn.test.ts` |
| RF-7.1, RF-7.2 | `domain/turn.ts` | `turn.test.ts` |
| RF-7.3 a RF-7.5 | `domain/game.ts` | `game.test.ts` |
| RF-8.1, RF-8.2 | `domain/game.ts` | `game.test.ts` |
| RF-8.3 | `domain/game.ts` | `game.test.ts` |
| RF-8.4 a RF-8.6 | `domain/uma.ts` | `uma.test.ts` |
| RF-8.7 | `domain/game.ts` | `game.test.ts` |
| RF-8.8 | `domain/turn.ts`, `domain/game.ts` | `turn.test.ts`, `game.test.ts` |
| RF-9.1, RF-9.2 | `domain/rules.ts`, `domain/game.ts` | `rules.test.ts`, `game.test.ts` |
| RF-9.3 | `domain/game.ts` | `game.test.ts` |
| RF-9.4, RF-9.5 | `domain/game.ts`, `data/games.repository.ts` | `game.test.ts`, `games.repository.test.ts` |
| RF-9.6 | `domain/stats/recalculate.ts` | `recalculate.test.ts` |
| RF-10.1 a RF-10.3 | `composables/useGames` | `games.repository.test.ts` |
| RF-10.4, RF-10.5 | `domain/game.ts` (constante de 7 días) | `game.test.ts` |
| RF-10.6 | `domain/game.ts` | `game.test.ts` |
| RF-11.1 a RF-11.7 | `domain/seasons.ts`, `data/seasons.repository.ts` | `seasons.test.ts`, `seasons.repository.test.ts` |
| RF-12.1 a RF-12.4 | `domain/stats.ts` | `stats.test.ts` |
| RF-12.5 | `composables/useGames` | `games.repository.test.ts` |
| RF-12.6 | `domain/stats.ts` | `stats.test.ts` |
| RF-12.7 | `domain/stats/recalculate.ts` | `recalculate.test.ts` |
| RF-12.8 | `domain/stats.ts` | `stats.test.ts` |
| RF-13.1 a RF-13.4 | `domain/ranking.ts` | `ranking.test.ts` |
| RF-13.5 a RF-13.7 | `composables/useRankings`, `stores/preferences` | `ranking.test.ts` |
| RF-14.1, RF-14.2 | `firestore.rules` | `rules.test.ts` con emulador |
| RF-14.3 | `pages/LoginPage` | `LoginPage.test.ts` |
| RF-14.4 | `components/layout`, `pages/GameDetailPage` | `GameDetailPage.test.ts` |
| RF-15.1, RF-15.2 | `firestore.rules`, `stores/session` | `rules.test.ts` con emulador |
| RF-15.3, RF-15.7 | `composables/useGameTurns` | `TurnForm.test.ts` |
| RF-15.4 | `stores/session` | `session.test.ts` |
| RF-15.5, RF-15.6 | `firestore.rules`, `app/firebase.ts` | `rules.test.ts`, `firebase.test.ts` |
| RF-15.8 | `composables/useGameTurns` | `TurnForm.test.ts` |
| RF-16.1 a RF-16.4 | `domain/handValue.ts` | `handValue.test.ts` |
| RF-16.5 | `domain/handValue.ts` | `handValue.test.ts` → `'determinismo'` |
| RF-16.6 | `domain/yaku.ts` | `yaku.test.ts` |
| RF-17.1 a RF-17.5 | `components/charts/` | `charts.test.ts` |

## 8. Checklist de salida

| # | Condición | Origen |
| --- | --- | --- |
| 1 | Los cuatro comandos en verde, en orden | Constitution III.1 |
| 2 | 100 % de líneas, ramas y funciones en `src/domain/` | Constitution IV.1 |
| 3 | Toda función pura de `domain/` con su test nombrado como el módulo | Constitution IV.2 |
| 4 | `any` inexistente; `strict` y `noUncheckedIndexedAccess` sin relajar | Constitution VI.1 |
| 5 | El narrowing se hace desde `state.status` | Constitution VI.2 |
| 6 | Ningún import de `firebase/*` fuera de `data/` y `app/firebase.ts` | Constitution V.1 |
| 7 | Exactamente dos stores, ninguno consumiendo `useQuery()` | Constitution V.2 |
| 8 | `lint` ejecutado en modo check, sin mutar ficheros | Constitution III.1 |
| 9 | Cada una de las 6 desviaciones de `../../docs/domain.md §4.5` con su test | Criterio 23 de la spec |
| 10 | Las 100 celdas de la tabla de puntuación verificadas contra la fórmula | Criterio 22 de la spec |

## 9. Riesgos y cómo se mitigan

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Una celda de la tabla de puntuación está mal y llega a `handValue.ts` | Resultado de mano incorrecto en todo el histórico | El barrido de las 100 celdas en `handValue.test.ts`. Ya detectó un error real: 3 han 25 fu por tsumo de no dealer estaba en 1700 en vez de 1600 |
| El invariante de cuadre se implementa como suma a cero | Se rechazan turnos correctos con riichi o chombo | El barrido de combinaciones en `turn.test.ts` y la fórmula explícita en RF-4.1 |
| La validación de turno se hace en el componente | La interfaz puede divergir del motor y RNF-1 se rompe | Toda validación en `domain/turn.ts`; el componente solo pinta el mensaje de error |
| Un clic accidental en finalizarSmall aborta una partida corta | Pérdida permanente de una partida | RF-9.1 exige confirmación previa. `abortada` es terminal por decisión del club, no por descuido |
| El conflicto offline entre dos dispositivos | Una captura se pierde | Declarado y aceptado en RF-15.6: gana la primera y la segunda recibe el rechazo de turno duplicado |
| El contador de dora no es verificable | Una mano con ura dora mal contada se puntúa mal en silencio | Declarado en §7 de la spec. Cerrarlo exige capturar el indicador de dora, que es una spec posterior |
| `games.date` con zona horaria inconsistente | Un partido puede caer en la temporada equivocada | Se resuelve en `domain/seasons.ts` usando fechas civiles; el diferido está anotado en `../../docs/reviews/001-qa.md` (`C17`) |
| Una partida de más de 99 turnos rompe el orden del ID | Historial desordenado | Irrealizable en la práctica. Diferido anotado en `../../docs/reviews/001-qa.md` (`D19`) |

## 10. Lo que este plan no cubre

- **M.League**: `ruleset: 'mleague'` existe en el tipo y no admite captura (RF-2.5). No se implementa
  ningún valor de uma para él.
- **Las fichas de la mano**: para una spec posterior, junto con la verificación del recuento de dora.
- **Los dos diferidos** de `../../docs/reviews/001-qa.md`: la zona horaria de `games.date` se resuelve en
  `domain/seasons.ts`; el techo de 99 turnos se documenta sin cambiar.
- **Constitution III.1 no puede cumplirse hasta la fase 0**: hoy no hay `package.json` ni código, así que
  los cuatro checks no son ejecutables. El primer entregable verificable es la fase 0.

---

## Anexo · Cambios ya aplicados a `../../AGENT.md` para que este plan sea realizable

`../../AGENT.md` enumera de forma exhaustiva los módulos de `domain/` y las páginas. Este plan introduce dos
elementos nuevos, así que la lista se actualizó para que no quedara desalineada:

| Cambio | Motivo |
| --- | --- |
| `domain/game.ts` añadido a la estructura de carpetas y a la tabla de responsabilidades | Decisión 13 de §5.1 |
| `GameDetailPage` y `RankingsPage` añadidas a la lista de páginas | Decisión 14 de §5.1 |
| Regla de «un test por módulo» añadida a §Tests, con los barridos dentro en un `describe` propio | Decisión 15 de §5.1, y recoge tu aclaración de que el barrido sea por módulo |
