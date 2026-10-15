# tasks.md — Tareas de `specs/001`

Listado de trabajo derivado de [`spec.md`](spec.md) y [`plan.md`](plan.md). El plan dice **qué** se
construye y en qué orden; este documento lo parte en tareas de 20 a 30 minutos.

## Cómo se usa

- Cada tarea es un `- [ ]`. **Marca la casilla solo cuando el "Hecho cuando" de esa tarea se cumple.**
- Para saber qué falta:

  ```bash
  grep -c '^- \[ \]' specs/001/tasks.md
  grep -n '^- \[ \]' specs/001/tasks.md
  ```

- Las tareas van en **orden de dependencias**: nada empieza antes de que su bloque termine.
- **Constitution III.1 se verifica al terminar cada tarea**, no al final:

  ```bash
  npm run typecheck && npm run lint && npm run test && npm run format:check
  ```

  `lint` es solo check. Un fallo ajeno al cambio se declara en la respuesta; no se oculta ni se salta un
  paso.
- **Constitution IV.1**: antes de cerrar la puerta de dominio, `npm run test:coverage` tiene que dar
  100 % de líneas, ramas y funciones en `src/domain/`.
- Los ficheros del proyecto viven en la raíz del repositorio. Las rutas de este documento son relativas
  a `specs/001/`, así que `docs/domain.md` se escribe `../../docs/domain.md`.

**Estimación:** 94 tareas · 30 a 45 horas.

---

## Fase 0 · Andamiaje — 5 tareas

Ninguna cubre RF: es lo que hace posible cumplir constitution III.1.

- [x] **T01** `package.json` con el stack y los scripts de `AGENT.md` · **Cubre:** — · **Hecho cuando:** `npm install` termina sin errores con las versiones fijadas en `AGENT.md`.
- [x] **T02** `tsconfig.json` con *project references* a `app`, `node` y `vitest` · **Cubre:** — · **Hecho cuando:** `npm run typecheck` responde con un error de configuración, no de script inexistente.
- [x] **T03** `.prettierrc.json` y `.editorconfig` con los valores de `AGENT.md` · **Cubre:** — · **Hecho cuando:** `npm run format:check` pasa sobre un `src/` vacío.
- [x] **T04** `eslint.config.js` flat con typescript-eslint, vue y Vitest acotado a `src/__tests__/` · **Cubre:** — · **Hecho cuando:** `npm run lint` pasa y `npm run lint` **no** modifica ningún fichero.
- [x] **T05** `vitest.config.ts` con `happy-dom`, alias `@/` y umbral 100 % en `src/domain/` · **Cubre:** — · **Hecho cuando:** un test trivial en `src/__tests__/` pasa, y `npm run test:coverage` falla si se baja del 100 % de `src/domain/`.

---

## Fase 1 · `domain/types.ts` — 4 tareas

- [x] **T06** IDs con marca (`PlayerId`, `SeasonId`, `GameId`) y entidades base · **Cubre:** RF-0.1, RF-0.5, RF-0.7, RF-2.4, RF-2.6 · **Hecho cuando:** `types.test-d.ts` demuestra que un `string` desnudo no es asignable a `PlayerId` y `npm run typecheck` pasa.
- [x] **T07** Uniones de literales de estado y resultado · **Cubre:** RF-0.1, RF-0.5, RF-0.7, RF-3.12 · **Hecho cuando:** `GameStatus` tiene exactamente `'open' | 'finalized' | 'unfinished' | 'aborted'` y `ResultType` exactamente `'tsumo' | 'ron' | 'ryuukyoku' | 'chombo'`, comprobado con aserciones de tipo.
- [x] **T08** Validación de nombre de jugador · **Cubre:** RF-1.8 · **Hecho cuando:** `types.test.ts` tiene casos para vacío tras recortar, 101 caracteres y nombre válido, y `validatePlayerName` devuelve la razón del rechazo.
- [x] **T09** Validación de formato de `externalId` · **Cubre:** RF-1.9 · **Hecho cuando:** `types.test.ts` rechaza un `externalId` con formato inválido y acepta los dos formatos válidos definidos.

---

## Fase 2 · `domain/yaku.ts` — 6 tareas

- [x] **T10** Catálogo de yaku normales con su han · **Cubre:** RF-16.1, RF-12.4 · **Hecho cuando:** `yaku.test.ts` comprueba que riichi vale 1, iipeiko 1, daisangen 6 y chinitsu 6.
- [x] **T11** Catálogo de los trece yaku de límite · **Cubre:** RF-16.1, RF-16.3 · **Hecho cuando:** `yaku.test.ts` cuenta exactamente 13 entradas de límite y ninguna tiene multiplicador por doble yakuman.
- [x] **T12** Reglas de fu · **Cubre:** RF-16.1, RF-4.6 · **Hecho cuando:** `yaku.test.ts` comprueba base 20, chiitoitsu 25, pinfu 20, +10 menzen ron, +2 tsumo, +2 triángulo cerrado y +2 kan.
- [x] **T13** Validación de yaku de viento contra asiento y ronda · **Cubre:** RF-4.5 · **Hecho cuando:** `yaku.test.ts` acepta un haku del Este y rechaza un haku del Norte si el jugador es el asiento de Este.
- [x] **T14** Validación de chiitoitsu contra los fu · **Cubre:** RF-4.6, RF-16.6 · **Hecho cuando:** `yaku.test.ts` rechaza 25 fu sin chiitoitsu y chiitoitsu con 30 fu.
- [x] **T15** Exigencia de al menos un yaku real · **Cubre:** RF-4.3 · **Hecho cuando:** `yaku.test.ts` rechaza `yakuHan: 0` aunque `doraCount` sea 13.

---

## Fase 3 · `domain/handValue.ts` — 8 tareas

- [x] **T16** `basicPoints` con la fórmula `fu × 2^(2 + totalHan)` · **Cubre:** RF-16.1 · **Hecho cuando:** `handValue.test.ts` comprueba que 1 han 30 fu da 240 y 4 han 30 fu da 1920.
- [x] **T17** `roundUp` a la centena · **Cubre:** RF-16.4 · **Hecho cuando:** `handValue.test.ts` comprueba que 240 sube a 300, 2000 se queda en 2000 y 1690 sube a 1700.
- [x] **T18** Pago de ron · **Cubre:** RF-16.1, RF-16.4 · **Hecho cuando:** 1 han 30 fu por ron da 1000 a no dealer y 1500 a dealer.
- [x] **T19** Pago de tsumo · **Cubre:** RF-16.1, RF-16.4 · **Hecho cuando:** 1 han 30 fu por tsumo da 300 de cada no dealer y 500 del dealer, y el total por tsumo es 1100 frente a 1000 por ron.
- [x] **T20** Honba · **Cubre:** RF-16.1 · **Hecho cuando:** con honba 1, un tsumo de dealer de 1 han 30 fu paga 600 de cada uno, y un ron de la misma mano con honba 1 paga 1800 en total.
- [x] **T21** Precedencia de manos límite · **Cubre:** RF-16.3 · **Hecho cuando:** `handValue.test.ts` comprueba que 5 han da 2000, 4 han 40 fu da 2000, 3 han 70 fu da 2000, 6 han da 3000, 12 han da 6000 y 13 han da 8000.
- [x] **T22** Barrido de las 100 celdas de las dos tablas · **Cubre:** RF-16.4, RF-4.4 · **Hecho cuando:** el `describe('tabla de puntuación')` recorre ambas tablas de `../../docs/domain.md`, recalcula cada celda desde la fórmula y falla si alguna no cuadra o si una fila `N/A` no coincide con su razón.
- [x] **T23** Determinismo del resultado · **Cubre:** RF-16.5 · **Hecho cuando:** el mismo input con las claves del objeto en orden distinto devuelve un resultado profundamente igual.

---

## Fase 4 · `domain/turn.ts` — 12 tareas

- [x] **T24** Resolución de un tsumo · **Cubre:** RF-3.3 · **Hecho cuando:** `turn.test.ts` comprueba los deltas de 1 han 30 fu de un dealer y de un no dealer.
- [x] **T25** Resolución de un ron simple · **Cubre:** RF-3.3 · **Hecho cuando:** `turn.test.ts` comprueba que el descartador paga el valor íntegro y los demás no se mueven.
- [x] **T26** Ron múltiple · **Cubre:** RF-6.1, RF-6.2, RF-6.3, RF-6.4 · **Hecho cuando:** con dos y con tres ganadores cada uno cobra su mano íntegra y el descartador paga la suma, y cuatro ganadores se rechazan.
- [x] **T27** Suufon renta · **Cubre:** RF-6.5 · **Hecho cuando:** con los cuatro ganando por tsumo, cada uno cobra su mano con el multiplicador que le corresponde por su localía y nadie paga al descartador.
- [x] **T28** Empate con reparto de tenpai · **Cubre:** RF-5.5 · **Hecho cuando:** con un no tenpai y tres tenpai el reparto es 1000 para cada tenpai, y con un solo tenpai cobra los 3000.
- [x] **T29** Prórroga con reparto de 1000 · **Cubre:** RF-5.5 · **Hecho cuando:** el empate de prórroga desplaza 1000 a los tenpai alineados en orden de ronda y el desalineado paga su parte.
- [x] **T30** Declaración de riichi · **Cubre:** RF-5.1, RF-5.2 · **Hecho cuando:** declarar riichi resta 1000 al declarante, sube el bote a 1000 y ningún `delta` de jugador recibe ese 1000.
- [x] **T31** Reclamación del bote · **Cubre:** RF-5.3, RF-5.5 · **Hecho cuando:** al ganar por tsumo o ron el ganador recibe el bote entero en un único `delta`, y en empate el bote no se mueve.
- [x] **T32** Bote en ron múltiple · **Cubre:** RF-5.4 · **Hecho cuando:** con dos ganadores de manos distintas el bote entero va al de mayor valor, y con manos iguales va al de menor asiento.
- [x] **T33** Chombo · **Cubre:** RF-7.2, RF-7.3 · **Hecho cuando:** el chombo asigna −8000 al que abandona, ningún otro delta lo compensa y `turn.test.ts` documenta que la partida no se interrumpe.
- [x] **T34** Invariante de cuadre · **Cubre:** RF-4.1 · **Hecho cuando:** el `describe('invariante de cuadre')` barre `resultType` × localía × número de ganancia × riichi × chombo y comprueba `Σ deltas = −(1000 × riichi) − (8000 × chombos)` en todas.
- [x] **T35** Detección de bancarrota · **Cubre:** RF-4.7, RF-8.8 · **Hecho cuando:** un turno que deja a alguien bajo cero se aplica íntegro y devuelve `bankrupt: true` con el saldo negativo resultante.

---

## Fase 5 · `domain/rules.ts` — 3 tareas

- [x] **T36** Mínimo de turnos por modo · **Cubre:** RF-2.6, RF-9.1, RF-9.2 · **Hecho cuando:** `rules.test.ts` comprueba que tonpuusen exige 4 y hanchan 8, y que por debajo `canFinalize` es falso.
- [x] **T37** Localía y honba por turno · **Cubre:** RF-2.6, RF-3.13 · **Hecho cuando:** la localía avanza por asiento y el honba se incrementa cuando el dealer no gana y vuelve a cero cuando gana.
- [x] **T38** Renchan y prórroga · **Cubre:** RF-9.1 · **Hecho cuando:** `rules.test.ts` comprueba que el dealer mantiene la localía tras renchan y que la prórroga solo se añade si el líder no llega a 30 000.

---

## Fase 6 · `domain/uma.ts` y `domain/game.ts` — 8 tareas

- [x] **T39** Uma y punto de retorno · **Cubre:** RF-8.4, RF-8.5, RF-8.6 · **Hecho cuando:** `uma.test.ts` comprueba 30, +10, −10 y −30, y que no hay ninguna rama de ajuste por posición.
- [x] **T40** Puntuación final con uma · **Cubre:** RF-8.1, RF-8.5 · **Hecho cuando:** `game.test.ts` comprueba que la puntuación final es marcador + uma y que la suma de los cuatro uma es 0.
- [x] **T41** Posiciones y desempate por asiento · **Cubre:** RF-8.2, RF-8.3 · **Hecho cuando:** con dos jugadores empatados gana el de menor asiento y las posiciones resultantes son 1.º, 2.º, 3.º y 4.º sin huecos.
- [x] **T42** Máquina de estados del juego · **Cubre:** RF-0.1 · **Hecho cuando:** `game.test.ts` rechaza capturar turnos en `finalized`, `unfinished` y `aborted`.
- [x] **T43** Transiciones y estados terminales · **Cubre:** RF-0.2, RF-0.3 · **Hecho cuando:** `unfinished` y `aborted` no tienen transición de salida, y una partida en cualquiera de los dos conserva sus turnos y no computa.
- [x] **T44** Cierre obligatorio por bancarrota · **Cubre:** RF-0.4 · **Hecho cuando:** con `mustFinalize` activo la única transición permitida es finalizar, y registrar un turno nuevo se rechaza.
- [x] **T45** Regla de los 7 días · **Cubre:** RF-10.4, RF-10.5 · **Hecho cuando:** `game.test.ts` comprueba que a 6 días no se ofrece abandonar y a 8 días sí, y que `updatedAt` se lee en días naturales.
- [x] **T46** Resultado final con chombo y bancarrota · **Cubre:** RF-7.4, RF-7.5, RF-8.8 · **Hecho cuando:** `game.test.ts` comprueba que una partida con un chombo suma 92 000, se finaliza y computa, y que `results[]` marca `chombo` y `bankrupt`.

---

## Fase 7 · `domain/seasons.ts` — 5 tareas

- [x] **T47** Validación del rango de fechas · **Cubre:** RF-11.3 · **Hecho cuando:** `seasons.test.ts` rechaza una temporada con `dateFrom` posterior a `dateTo`.
- [x] **T48** Detección de solapamiento · **Cubre:** RF-11.2 · **Hecho cuando:** dos rangos que se tocan en un extremo se consideran solapados y la creación se rechaza indicando cuál.
- [x] **T49** Asignación de partida a temporada por fecha · **Cubre:** RF-11.5 · **Hecho cuando:** una fecha dentro del rango devuelve esa temporada y, con los rangos sin solapar, nunca devuelve dos.
- [x] **T50** Partida sin temporada · **Cubre:** RF-11.6 · **Hecho cuando:** una fecha fuera de todo rango devuelve `null` y la partida no se considera inválida.
- [x] **T51** Estado de temporada · **Cubre:** RF-0.5, RF-0.6 · **Hecho cuando:** una temporada cerrada no admite cambios de rango y `canAcceptGameDate` es falso para fechas dentro de su rango.

---

## Fase 8 · `domain/ranking.ts`, `stats.ts` y `recalculate.ts` — 5 tareas

- [x] **T52** Agregación por jugador · **Cubre:** RF-12.1, RF-12.2, RF-12.3, RF-12.8 · **Hecho cuando:** `stats.test.ts` cuenta partidas finalizadas, victorias y desglose de posiciones, y `actualPoints` suma puntuaciones con uma.
- [x] **T53** Contadores de yaku por jugador · **Cubre:** RF-12.4 · **Hecho cuando:** `stats.test.ts` acumula los nueve contadores, y `yakuman` suma 1 por mano con yaku de límite o 13+ han aunque tenga cuatro.
- [x] **T54** Clasificación y desempate · **Cubre:** RF-13.1, RF-13.2, RF-13.3, RF-13.4, RF-13.6 · **Hecho cuando:** `ranking.test.ts` ordena por `points` con uma, desempata por victorias, luego segundas y luego alfabeto, y devuelve vacío sin partidas finalizadas.
- [x] **T55** `recalculate` idempotente · **Cubre:** RF-0.2, RF-9.5, RF-9.6, RF-12.7 · **Hecho cuando:** el `describe('idempotencia')` recalcula dos veces las mismas partidas de la fixture `temporadaCompleta` y ambos resultados son profundamente iguales, y solo entran partidas `finalized`.
- [x] **T56** Orden total y estable · **Cubre:** RF-13.1, RF-13.3 · **Hecho cuando:** el `describe('desempate')` comprueba que dos jugadores empatados en todo dan un orden que no depende del orden de entrada del array.

---

## Puerta de dominio

- [x] **T57** Cobertura del 100 % en `src/domain/` · **Cubre:** todos los RF de dominio · **Hecho cuando:** `npm run test:coverage` informa 100 % de líneas, ramas y funciones sobre `src/domain/` (constitution IV.1).

---

## Fase 9 · `data/` — 7 tareas

- [x] **T58** `app/firebase.ts` con caché local persistente · **Cubre:** RF-15.6 · **Hecho cuando:** la inicialización usa `initializeFirestore` con `persistentLocalCache` y no llama a `getFirestore`.
- [x] **T59** `batch.ts` · **Cubre:** RF-9.5 · **Hecho cuando:** cada función de escritura acepta un `batch?: WriteBatch` opcional y por defecto usa el suyo.
- [x] **T60** `players.repository.ts` · **Cubre:** RF-1.1 a RF-1.7, RF-0.7 · **Hecho cuando:** `create` no borra contadores derivados y `findByExternalId` devuelve el jugador o `null`.
- [x] **T61** `seasons.repository.ts` · **Cubre:** RF-11.1 a RF-11.7, RF-0.5 · **Hecho cuando:** `findOverlapping` y `findByDateRange` traen su comentario de índice compuesto.
- [x] **T62** `games.repository.ts` · **Cubre:** RF-2.1 a RF-2.9, RF-0.1, RF-9.3 · **Hecho cuando:** `listOpen` filtra por `status` y `updatedAt`, y `update` rechaza cambios en un juego `finalized`.
- [x] **T63** `turns.repository.ts` · **Cubre:** RF-3.1 a RF-3.8 · **Hecho cuando:** `create` falla con el turno duplicado y `nextNumber` devuelve el siguiente sin huecos.
- [x] **T64** Repositorios derivados · **Cubre:** RF-12.5, RF-13.5 · **Hecho cuando:** `replaceForSeason` escribe los documentos derivados del batch que recibe y no toca los de otras temporadas.

---

## Fase 10 · `queries/`, `composables/` y `stores/` — 7 tareas

- [x] **T65** `queries/players` + `usePlayers` · **Cubre:** RF-1.1 a RF-1.7 · **Hecho cuando:** expone `{ data, isLoading, error, refresh }` y estrecha por `state.status` (constitution VI.2).
- [x] **T66** `queries/seasons` + `useSeasons` · **Cubre:** RF-11.1 a RF-11.7 · **Hecho cuando:** tras crear invalida `['seasons']` y tras cerrar invalida `['games']`.
- [x] **T67** `queries/games` + `useGames` · **Cubre:** RF-2.1 a RF-2.9, RF-9.1 a RF-9.6 · **Hecho cuando:** finalizar y deshacer invalidan `['season-stats', seasonId]` y `['rankings', seasonId]`.
- [x] **T68** `queries/turns` + `useGameTurns` · **Cubre:** RF-3.1 a RF-3.14, RF-4.x, RF-15.7, RF-15.8 · **Hecho cuando:** registra, corrige y abandona, y guarda el borrador en `localStorage` al confirmar.
- [x] **T69** Queries derivadas · **Cubre:** RF-12.5, RF-13.5 a RF-13.7 · **Hecho cuando:** ambas usan `enabled` cuando falta `seasonId` y no dependen una de otra.
- [x] **T70** `stores/session.ts` · **Cubre:** RF-15.1 a RF-15.5 · **Hecho cuando:** no llama a `useQuery()` y mantiene el usuario entre navegaciones (constitution V.2).
- [x] **T71** `stores/preferences.ts` · **Cubre:** RF-13.7 · **Hecho cuando:** persiste la última temporada vista en `localStorage` y ningún store consume `useQuery()`.

---

## Fase 11 · i18n, interfaz y gráficas — 13 tareas

- [x] **T72** `i18n/locales/es.ts` con los tokens base · **Cubre:** — · **Hecho cuando:** existen los grupos `errors.*`, `uma.*`, `yaku.*` y `handValue.*`, y no hay texto literal en ningún componente.
- [x] **T73** `BaseButton`, `BaseInput`, `BaseSelect` · **Cubre:** — · **Hecho cuando:** los tres aceptan `defineProps<Props>()` tipado y no mutan props.
- [x] **T74** `BaseDialog`, `BaseSnackbar`, `BaseCard` · **Cubre:** — · **Hecho cuando:** `BaseDialog` emite `close` y no usa `alert`, `confirm` ni `prompt`.
- [x] **T75** `BaseTable` · **Cubre:** — · **Hecho cuando:** formatea números y fechas por i18n, nunca con `toFixed`.
- [x] **T76** `AppShell`, `AppHeader`, `AppNav` · **Cubre:** RF-14.4 · **Hecho cuando:** la navegación oculta las acciones de captura sin sesión y ninguna delata credenciales.
- [x] **T77** `PlayerForm` · **Cubre:** RF-1.2, RF-1.8, RF-1.9 · **Hecho cuando:** avisa de coincidencia de `externalId` o nombre, y muestra las tres razones de rechazo de nombre.
- [x] **T78** `SeasonForm` · **Cubre:** RF-11.1, RF-11.2, RF-11.3 · **Hecho cuando:** el solapamiento y el rango invertido bloquean la creación con mensaje propio.
- [x] **T79** `GameForm` · **Cubre:** RF-2.1 a RF-2.9 · **Hecho cuando:** exige cuatro asientos válidos, longitud y fecha, y avisa si un jugador ya está en otra partida abierta sin bloquear.
- [x] **T80** `TurnForm`: datos de partida · **Cubre:** RF-3.12, RF-3.14, RF-15.8 · **Hecho cuando:** exige tipo de resultado y tenpai en empate, y el borrador sobrevive a recargar.
- [x] **T81** `TurnForm`: mano y validación · **Cubre:** RF-3.13, RF-4.2 a RF-4.8, RF-15.7 · **Hecho cuando:** pide yaku, han de yaku, dora, fu, honba y localía, y cada rechazo muestra su clave `errors.turn.*` concreta.
- [x] **T82** `PointsEvolutionChart` y `PositionsChart` · **Cubre:** RF-17.1, RF-17.2, RF-17.4, RF-17.5 · **Hecho cuando:** reciben los datos por props, no consultan nada, y destruyen la instancia en `onBeforeUnmount`.
- [x] **T83** `YakuChart` · **Cubre:** RF-17.3, RF-17.4, RF-17.5 · **Hecho cuando:** cada barra dibujada es el mismo valor que muestra la tabla de estadísticas.
- [x] **T84** `styles/main.css` y `palette.ts` · **Cubre:** — · **Hecho cuando:** los tokens están en `@theme`, no hay hexadecimales sueltos en `<style scoped>` y la paleta se declara una sola vez.

---

## Fase 12 · Páginas y rutas — 6 tareas

- [x] **T85** `DashboardPage` · **Cubre:** RNF-4 · **Hecho cuando:** se ve correctamente a 360 px de ancho y en escritorio.
- [x] **T86** `GamesPage` y `GameDetailPage` · **Cubre:** RF-2.x, RF-3.x, RF-4.x, RF-9.x, RF-10.x · **Hecho cuando:** `GameDetailPage` confirma antes de finalizar, y una partida `abortada` no ofrece finalizar.
- [x] **T87** `PlayersPage` y `SeasonsPage` · **Cubre:** RF-1.x, RF-11.x · **Hecho cuando:** un jugador dado de baja conserva su histórico visible, y una temporada cerrada no admite partidas nuevas.
- [x] **T88** `StatsPage` y `RankingsPage` · **Cubre:** RF-12.x, RF-13.x, RF-17.x · **Hecho cuando:** el ranking exige temporada elegida y cada cifra enlaza a las partidas que la componen.
- [x] **T89** `LoginPage` · **Cubre:** RF-14.3, RF-15.4 · **Hecho cuando:** un intento de acceso no muestra detalles de cuenta ni información de otros usuarios.
- [x] **T90** Router y guard de sesión · **Cubre:** RF-14.2, RF-15.1, RF-15.3 · **Hecho cuando:** una acción de captura sin sesión redirige al acceso y conserva lo escrito.

---

## Fase 13 · Seguridad y cierre — 4 tareas

- [x] **T91** `firestore.rules` · **Cubre:** RF-14.1, RF-14.2, RF-15.1, RF-15.2, RF-15.5 · **Hecho cuando:** la lectura es pública, la escritura exige sesión y no hay ninguna regla con `admin`.
- [x] **T92** `rules.test.ts` contra el emulador · **Cubre:** RF-14.1, RF-14.2, RF-15.1, RF-15.2 · **Hecho cuando:** un anónimo lee, un anónimo recibe `permission-denied` al escribir, y un autenticado escribe.

> **✅ Cerrada contra el emulador (2026-10-08).** Los cuatro tests pasan de verdad, sin `skip`.
> Se ejecutó el emulador de Firestore y el de Auth dentro de un contenedor (`node:20` con JRE 17 y
> `firebase-tools`), publicado en `127.0.0.1:8080` y `127.0.0.1:9099`, de modo que **no hace
> falta instalar ninguna JRE en la máquina**. Con las dos variables de entorno definidas, la suite
> completa queda en `532 passed` y `0 skipped`.
>
> Al ejecutarlos aparecieron dos defectos reales del propio test, que hasta entonces nunca se
> habían visto porque el bloque se saltaba siempre:
>
> - `initializeApp` se llamaba sin `apiKey`, así que `getAuth` fallaba con `auth/invalid-api-key`
>   antes de tocar la base de datos. El emulador no acepta esa inicialización.
> - `afterAll` llamaba a `terminate(db)` sin comprobar que `db` existiera.
>
> Además el fichero pasó a `@vitest-environment node`: con `happy-dom` el `fetch` que intercepta el
> SDK de Auth no habla con el emulador (`socket hang up`).
- [x] **T93** Cobertura final y los cuatro en verde · **Cubre:** todos · **Hecho cuando:** `typecheck && lint && test && format:check` pasan en ese orden, y `test:coverage` mantiene el 100 % de `src/domain/`.
- [x] **T94** Checklist de salida · **Cubre:** todos · **Hecho cuando:** las 10 condiciones de `plan.md` §8 están comprobadas una a una, y las 6 desviaciones de `../../docs/domain.md` §4.5 tienen su test.

---

## Fase 14 · Autenticación — 9 tareas

Abre el hallazgo **A19** de `../../docs/reviews/001-qa.md`: el cierre de A14 («sesión comprobada, no
gestionada») dejó la aplicación sin ninguna forma de **obtener** la sesión que exigen RF-15.1 y
RF-15.2, de modo que `firestore.rules` denegaba toda escritura. T89 y T90 quedan como estaban: una
tarea marcada no se desmarca.

- [x] **T95** Cerrar el mecanismo en la spec · **Cubre:** RF-15.9 · **Hecho cuando:** `spec.md` tiene RF-15.9, el criterio 21, la duda 27 y §10.5 distingue autenticación (dentro) de gestión de cuentas (fuera).
- [x] **T96** Hallazgo `A19` en `../../docs/reviews/001-qa.md` · **Cubre:** — · **Hecho cuando:** consta por qué A14 no bastaba y dónde se cierra, y el recuento de hallazgos sigue cuadrando.
- [x] **T97** `BaseInput` admite `email`, `password` y `autocomplete` · **Cubre:** RF-15.9 · **Hecho cuando:** `BaseInput.test.ts` comprueba los tres como props declaradas, no como atributos caídos, y el typecheck acepta los dos tipos nuevos.
- [x] **T98** `app/firebase.ts`: acceso y traducción de errores · **Cubre:** RF-15.9, RF-14.3 · **Hecho cuando:** `firebase.test.ts` comprueba que `signInWithEmail` llama al SDK con el correo y la contraseña recibidos, y que `user-not-found` y `wrong-password` producen el mismo `AuthError` sin filtrar el código del SDK.
- [x] **T99** `stores/session.ts`: `signIn` y `pending` · **Cubre:** RF-15.9, RF-15.4 · **Hecho cuando:** `session.test.ts` comprueba que `signIn` delega en `app/firebase.ts`, marca `pending` mientras espera, y que el estado lo sigue fijando `onAuthStateChanged`.
- [x] **T100** `LoginPage`: formulario de acceso · **Cubre:** RF-15.9, RF-14.3 · **Hecho cuando:** `LoginPage.test.ts` pide correo y contraseña con su `autocomplete`, y un rechazo muestra un único mensaje que no dice si la cuenta existe.
- [x] **T101** `LoginPage`: vuelta a la ruta interrumpida · **Cubre:** RF-15.3, RF-15.7 · **Hecho cuando:** con `query.redirect` se vuelve a esa ruta interna, sin ella al panel, y un `redirect` que no es interno se ignora.
- [x] **T102** `AppHeader` con sesión sin `displayName` · **Cubre:** RNF-7 · **Hecho cuando:** una cuenta creada con correo muestra una etiqueta neutra, y ni el correo ni el identificador aparecen en pantalla.
- [x] **T103** Los cuatro en verde y el 100 % de `domain/` · **Cubre:** todos · **Hecho cuando:** `typecheck && lint && test && format:check` pasan en ese orden, `test:coverage` mantiene el 100 % de `src/domain/`, y `../../AGENT.md` documenta la costura de autenticación.

**Bug de producción encontrado por T98.** `signOutSession()` llamaba a `getAuthInstance().signOut()`,
un método que el objeto `Auth` no tiene: el botón «Cerrar sesión» de `AppHeader` fallaba en el
navegador y ningún test lo detectaba porque `session.test.ts` sustituye el módulo entero. Corregido
a la función `signOut(auth)` del SDK, con su test en `firebase.test.ts`.

---

## Fase 15 · Contrato del invariante de cuadre — 1 tarea

Abre un hallazgo del club al usar la aplicación: `resolveTurn` cuadraba bien, pero `checkSquare`
recibía un parámetro cuyo nombre invitaba a pasar el bote **previo** en lugar del reclamado, y
`../../docs/domain.md` afirmaba que el pago del riichi no entraba en los deltas, contradiciendo a
RF-4.1 y al código.

- [x] **T104** Contrato de `checkSquare` y frase del riichi · **Cubre:** RF-4.1, RF-5.1, RF-5.3 · **Hecho cuando:** el parámetro se llama `riichiSticksClaimedThisTurn` y su comentario dice que cuenta las fichas declaradas en el propio turno; el caso «el ganador declara riichi en la mano que gana con la mesa vacía» tiene test con sus números, y `TurnForm` compara con las fichas de ese turno y no solo con el bote previo; y `../../docs/domain.md` dice que el pago entra en el delta del declarante y vuelve al ganador si ese mismo turno se lleva el bote.

**Lo que fallaba de verdad.** `TurnForm` pasaba a `checkSquare` las fichas **previas** de la mesa en lugar de las reclamadas en el turno, así que pedía `−1000` contra un Σ que ya era 0 y rechazaba la captura con `errors.turn.notSquare`: el turno no se guardaba y solo se veía «La suma de deltas no cuadra». El motor nunca estuvo mal. Como caso: 5 han (riichi + ippatsu + tsumo cerrado + 2 dora) es **mangan**, así que el Este cobra 4000 de cada uno, su propio riichi le vuelve con el bote y su delta es **+12 000** frente a −4000 × 3, con Σ = 0.

---

## Fase 16 · Reglas para consultas por grupo de colección — 1 tarea

Abre un hallazgo del club al usar la aplicación: la pantalla de estadísticas respondía
`permission-denied`. Las reglas cubrían la ruta literal `playerSeasonStats/{playerId}/stats/{seasonId}`,
pero el repositorio consulta `collectionGroup('stats')`, y una consulta a un grupo de colección solo
se concede si las reglas cubren el grupo con un comodín recursivo sobre el padre.

- [x] **T105** Comodín recursivo para el grupo `stats` · **Cubre:** RF-12.5, RF-12.7, RF-15.1 · **Hecho cuando:** `firestore.rules.test.ts` extrae los grupos de colección del código y todos tienen regla `/{parent=**}/{grupo}/{doc}` con lectura pública y escritura autenticada.

**Lo que fallaba de verdad.** `collectionGroup('stats')` se usaba en dos sitios de
`playerSeasonStats.repository.ts`: la lectura que ve la pantalla de estadísticas, y el borrado previo de
`replaceForSeason`. Con la ruta literal, Firestore no puede probar que la consulta solo devuelve
documentos permitidos y **deniega la petición entera**, no solo los documentos que no encajen. Por eso el
síntoma era doble: las estadísticas no cargaban **y** finalizar una partida tampoco podía reescribir
sus derivados. El comodín no se puede acotar al padre —es la contrapartida de usar grupos de colección—,
así que aplica a cualquier `*/stats/{doc}`; queda anotado en la propia regla.

---

## Fase 17 · Índice del grupo de colección `stats` — 1 tarea

Segunda mitad del mismo hallazgo: con la regla ya correcta, la consulta pasó de `permission-denied` a `failed-precondition`. Firestore solo crea índices automáticos de un solo campo **con alcance `COLLECTION`**; los de grupo hay que declararlos, aunque tengan un solo campo.

- [x] **T106** Índice de `stats` con alcance `COLLECTION_GROUP` · **Cubre:** RF-12.5, RF-12.7 · **Hecho cuando:** `firestore.indexes.test.ts` extrae del código los grupos de colección que se consultan y cada uno tiene su índice de alcance `COLLECTION_GROUP` cubriendo los campos filtrados, con el comentario de índice en su repositorio; y los índices de un solo campo solo se prohuden con alcance `COLLECTION`.

**Lo que fallaba de verdad, y por qué costó tres arreglos.** `playerSeasonStats` consulta `collectionGroup('stats')`, y eso arrastra tres consecuencias que hubo que descubrir una detrás de otra: las reglas necesitan un comodín recursivo sobre el padre (T105), el índice se declara a mano con alcance `COLLECTION_GROUP` (esta tarea), y la segunda consulta —el borrado previo de `replaceForSeason`— sigue sin verificarse contra el emulador (T92). El test que bloqueaba esto estaba en el propio `firestore.indexes.test.ts`: afirmaba «Firestore crea solo los índices de un solo campo» sin excluir el caso del grupo, y por eso impedía añadir el índice que hacía falta.

**Alternativa que evita las tres.** Consultar `playerSeasonStats/{seasonId}/players/{playerId}`, igual que ya hace `rankings`, elimina el grupo de colección: sin comodín, sin índice de grupo y sin la causa de la cadena. Se dejó el comodín por decisión del club y porque el cambio de modelo toca `plan.md §4.1` y `AGENT.md`.

---

## Trazabilidad de RF a tareas

Ninguna tarea de este listado deja RF sin cubrir. Los RF sin tarea propia son los de
[tipos](#fase-1--domaintypests--4-tareas), los transversales de acceso y los no funcionales.

| RF | Tarea |
| --- | ----- |
| RF-0.1 | T06, T07, T42, T62 |
| RF-0.2 | T43, T55 |
| RF-0.3 | T43 |
| RF-0.4 | T44 |
| RF-0.5 | T06, T07, T51, T61 |
| RF-0.6 | T51 |
| RF-0.7 | T06, T07, T60 |
| RF-1.1 a RF-1.7 | T60, T65 |
| RF-1.8 | T08, T77 |
| RF-1.9, RF-1.10 | T09, T77 |
| RF-2.1 a RF-2.9 | T62, T67, T79, T86 |
| RF-3.1, RF-3.2 | T63, T68 |
| RF-3.3 | T24, T25 |
| RF-3.4 a RF-3.7 | T63, T68 |
| RF-3.8 | T63 |
| RF-3.9, RF-3.10 | T68, T86 |
| RF-3.11 | T86 |
| RF-3.12 | T07, T80 |
| RF-3.13 | T37, T81 |
| RF-3.14 | T80 |
| RF-4.1 | T34 |
| RF-4.2 | T81 |
| RF-4.3 | T15 |
| RF-4.4 | T22 |
| RF-4.5 | T13 |
| RF-4.6 | T12, T14 |
| RF-4.7 | T35 |
| RF-4.8 | T81 |
| RF-5.1, RF-5.2 | T30 |
| RF-5.3, RF-5.5 | T31 |
| RF-5.4 | T32 |
| RF-5.6 | T86 |
| RF-5.7 | T86 |
| RF-6.1 a RF-6.4 | T26 |
| RF-6.5 | T27 |
| RF-7.1, RF-7.2 | T33 |
| RF-7.3 a RF-7.5 | T46 |
| RF-8.1, RF-8.2 | T40, T41 |
| RF-8.3 | T41 |
| RF-8.4 a RF-8.6 | T39 |
| RF-8.7 | T38 |
| RF-8.8 | T35, T46 |
| RF-9.1, RF-9.2 | T36, T38 |
| RF-9.3 | T62 |
| RF-9.4, RF-9.5 | T59, T67 |
| RF-9.6 | T55, T67 |
| RF-10.1 a RF-10.3 | T67, T86 |
| RF-10.4, RF-10.5 | T45 |
| RF-10.6 | T44 |
| RF-11.1 a RF-11.7 | T61, T66 |
| RF-12.1 a RF-12.3, RF-12.8 | T52 |
| RF-12.4 | T10, T53 |
| RF-12.5 | T64, T69, T105, T106 |
| RF-12.6 | T52 |
| RF-12.7 | T55, T105, T106 |
| RF-13.1 a RF-13.4, RF-13.6 | T54 |
| RF-13.5 | T64, T69 |
| RF-13.7 | T69, T71 |
| RF-14.1, RF-14.2 | T91, T92 |
| RF-14.3 | T89, T98, T100 |
| RF-14.4 | T76 |
| RF-15.1, RF-15.2 | T91, T92 |
| RF-15.3 | T90, T101 |
| RF-15.4 | T70, T89, T99 |
| RF-15.5 | T70, T91 |
| RF-15.6 | T58 |
| RF-15.7, RF-15.8 | T68, T81, T101 |
| RF-15.9 | T95, T97, T98, T99, T100 |
| RF-16.1 | T10, T11, T12, T16, T18, T19, T20 |
| RF-16.2 | T24, T25, T26, T27 |
| RF-16.3 | T11, T21 |
| RF-16.4 | T17, T18, T19, T22 |
| RF-16.5 | T23 |
| RF-16.6 | T14 |
| RF-17.1, RF-17.2 | T82 |
| RF-17.3 | T83 |
| RF-17.4, RF-17.5 | T82, T83 |
| RNF-1 | T23, T93 |
| RNF-2 | T63 |
| RNF-3 | T55, T93 |
| RNF-4 | T85 |
| RNF-5 | T58 |
| RNF-6 | T54, T71, T88 |
| RNF-7 | T76, T91, T102 |
| RNF-8 | T49, T61, T62 |

---

## Notas de mantenimiento

**Grano.** Si una tarea se pasa de 30 minutos, se parte en dos con sufijos: `T22a` y `T22b`. Hay cuatro
candidatas previsibles a partirse: **T22** (barrido de 100 celdas), **T55** (recalculate con las cuatro
fixtures), **T81** (TurnForm completa) y **T86** (dos p├íginas de captura).

**Puerta de dominio.** **T57** no es una tarea m├ís: cierra la mitad de desarrollo. Si el 100 % de
`domain/` no se alcanza antes de empezar la fase 9, arrastrar el hueco hasta el final es mucho m├ís caro que
cerrarlo aqu├¡.

**Tareas sin RF propio, y es correcto.** T01 a T05 son el andamiaje que hace posible cumplir III.1, y T84
son estilos. El criterio 1 de `plan.md` ┬º8 dice que eso se entrega en la primera tarea.

**Al reabrir un hallazgo.** Si una revisi├│n futura de `../../docs/reviews/001-qa.md` reabre algo, se a├▒ade
una tarea nueva al final de la fase correspondiente en vez de editar una ya cerrada. Una tarea marcada no se
desmarca.
