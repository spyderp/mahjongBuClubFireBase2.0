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

- [ ] **T52** Agregación por jugador · **Cubre:** RF-12.1, RF-12.2, RF-12.3, RF-12.8 · **Hecho cuando:** `stats.test.ts` cuenta partidas finalizadas, victorias y desglose de posiciones, y `actualPoints` suma puntuaciones con uma.
- [ ] **T53** Contadores de yaku por jugador · **Cubre:** RF-12.4 · **Hecho cuando:** `stats.test.ts` acumula los nueve contadores, y `yakuman` suma 1 por mano con yaku de límite o 13+ han aunque tenga cuatro.
- [ ] **T54** Clasificación y desempate · **Cubre:** RF-13.1, RF-13.2, RF-13.3, RF-13.4, RF-13.6 · **Hecho cuando:** `ranking.test.ts` ordena por `points` con uma, desempata por victorias, luego segundas y luego alfabeto, y devuelve vacío sin partidas finalizadas.
- [ ] **T55** `recalculate` idempotente · **Cubre:** RF-0.2, RF-9.5, RF-9.6, RF-12.7 · **Hecho cuando:** el `describe('idempotencia')` recalcula dos veces las mismas partidas de la fixture `temporadaCompleta` y ambos resultados son profundamente iguales, y solo entran partidas `finalized`.
- [ ] **T56** Orden total y estable · **Cubre:** RF-13.1, RF-13.3 · **Hecho cuando:** el `describe('desempate')` comprueba que dos jugadores empatados en todo dan un orden que no depende del orden de entrada del array.

---

## Puerta de dominio

- [ ] **T57** Cobertura del 100 % en `src/domain/` · **Cubre:** todos los RF de dominio · **Hecho cuando:** `npm run test:coverage` informa 100 % de líneas, ramas y funciones sobre `src/domain/` (constitution IV.1).

---

## Fase 9 · `data/` — 7 tareas

- [ ] **T58** `app/firebase.ts` con caché local persistente · **Cubre:** RF-15.6 · **Hecho cuando:** la inicialización usa `initializeFirestore` con `persistentLocalCache` y no llama a `getFirestore`.
- [ ] **T59** `batch.ts` · **Cubre:** RF-9.5 · **Hecho cuando:** cada función de escritura acepta un `batch?: WriteBatch` opcional y por defecto usa el suyo.
- [ ] **T60** `players.repository.ts` · **Cubre:** RF-1.1 a RF-1.7, RF-0.7 · **Hecho cuando:** `create` no borra contadores derivados y `findByExternalId` devuelve el jugador o `null`.
- [ ] **T61** `seasons.repository.ts` · **Cubre:** RF-11.1 a RF-11.7, RF-0.5 · **Hecho cuando:** `findOverlapping` y `findByDateRange` traen su comentario de índice compuesto.
- [ ] **T62** `games.repository.ts` · **Cubre:** RF-2.1 a RF-2.9, RF-0.1, RF-9.3 · **Hecho cuando:** `listOpen` filtra por `status` y `updatedAt`, y `update` rechaza cambios en un juego `finalized`.
- [ ] **T63** `turns.repository.ts` · **Cubre:** RF-3.1 a RF-3.8 · **Hecho cuando:** `create` falla con el turno duplicado y `nextNumber` devuelve el siguiente sin huecos.
- [ ] **T64** Repositorios derivados · **Cubre:** RF-12.5, RF-13.5 · **Hecho cuando:** `replaceForSeason` escribe los documentos derivados del batch que recibe y no toca los de otras temporadas.

---

## Fase 10 · `queries/`, `composables/` y `stores/` — 7 tareas

- [ ] **T65** `queries/players` + `usePlayers` · **Cubre:** RF-1.1 a RF-1.7 · **Hecho cuando:** expone `{ data, isLoading, error, refresh }` y estrecha por `state.status` (constitution VI.2).
- [ ] **T66** `queries/seasons` + `useSeasons` · **Cubre:** RF-11.1 a RF-11.7 · **Hecho cuando:** tras crear invalida `['seasons']` y tras cerrar invalida `['games']`.
- [ ] **T67** `queries/games` + `useGames` · **Cubre:** RF-2.1 a RF-2.9, RF-9.1 a RF-9.6 · **Hecho cuando:** finalizar y deshacer invalidan `['season-stats', seasonId]` y `['rankings', seasonId]`.
- [ ] **T68** `queries/turns` + `useGameTurns` · **Cubre:** RF-3.1 a RF-3.14, RF-4.x, RF-15.7, RF-15.8 · **Hecho cuando:** registra, corrige y abandona, y guarda el borrador en `localStorage` al confirmar.
- [ ] **T69** Queries derivadas · **Cubre:** RF-12.5, RF-13.5 a RF-13.7 · **Hecho cuando:** ambas usan `enabled` cuando falta `seasonId` y no dependen una de otra.
- [ ] **T70** `stores/session.ts` · **Cubre:** RF-15.1 a RF-15.5 · **Hecho cuando:** no llama a `useQuery()` y mantiene el usuario entre navegaciones (constitution V.2).
- [ ] **T71** `stores/preferences.ts` · **Cubre:** RF-13.7 · **Hecho cuando:** persiste la última temporada vista en `localStorage` y ningún store consume `useQuery()`.

---

## Fase 11 · i18n, interfaz y gráficas — 13 tareas

- [ ] **T72** `i18n/locales/es.ts` con los tokens base · **Cubre:** — · **Hecho cuando:** existen los grupos `errors.*`, `uma.*`, `yaku.*` y `handValue.*`, y no hay texto literal en ningún componente.
- [ ] **T73** `BaseButton`, `BaseInput`, `BaseSelect` · **Cubre:** — · **Hecho cuando:** los tres aceptan `defineProps<Props>()` tipado y no mutan props.
- [ ] **T74** `BaseDialog`, `BaseSnackbar`, `BaseCard` · **Cubre:** — · **Hecho cuando:** `BaseDialog` emite `close` y no usa `alert`, `confirm` ni `prompt`.
- [ ] **T75** `BaseTable` · **Cubre:** — · **Hecho cuando:** formatea números y fechas por i18n, nunca con `toFixed`.
- [ ] **T76** `AppShell`, `AppHeader`, `AppNav` · **Cubre:** RF-14.4 · **Hecho cuando:** la navegación oculta las acciones de captura sin sesión y ninguna delata credenciales.
- [ ] **T77** `PlayerForm` · **Cubre:** RF-1.2, RF-1.8, RF-1.9 · **Hecho cuando:** avisa de coincidencia de `externalId` o nombre, y muestra las tres razones de rechazo de nombre.
- [ ] **T78** `SeasonForm` · **Cubre:** RF-11.1, RF-11.2, RF-11.3 · **Hecho cuando:** el solapamiento y el rango invertido bloquean la creación con mensaje propio.
- [ ] **T79** `GameForm` · **Cubre:** RF-2.1 a RF-2.9 · **Hecho cuando:** exige cuatro asientos válidos, longitud y fecha, y avisa si un jugador ya está en otra partida abierta sin bloquear.
- [ ] **T80** `TurnForm`: datos de partida · **Cubre:** RF-3.12, RF-3.14, RF-15.8 · **Hecho cuando:** exige tipo de resultado y tenpai en empate, y el borrador sobrevive a recargar.
- [ ] **T81** `TurnForm`: mano y validación · **Cubre:** RF-3.13, RF-4.2 a RF-4.8, RF-15.7 · **Hecho cuando:** pide yaku, han de yaku, dora, fu, honba y localía, y cada rechazo muestra su clave `errors.turn.*` concreta.
- [ ] **T82** `PointsEvolutionChart` y `PositionsChart` · **Cubre:** RF-17.1, RF-17.2, RF-17.4, RF-17.5 · **Hecho cuando:** reciben los datos por props, no consultan nada, y destruyen la instancia en `onBeforeUnmount`.
- [ ] **T83** `YakuChart` · **Cubre:** RF-17.3, RF-17.4, RF-17.5 · **Hecho cuando:** cada barra dibujada es el mismo valor que muestra la tabla de estadísticas.
- [ ] **T84** `styles/main.css` y `palette.ts` · **Cubre:** — · **Hecho cuando:** los tokens están en `@theme`, no hay hexadecimales sueltos en `<style scoped>` y la paleta se declara una sola vez.

---

## Fase 12 · Páginas y rutas — 6 tareas

- [ ] **T85** `DashboardPage` · **Cubre:** RNF-4 · **Hecho cuando:** se ve correctamente a 360 px de ancho y en escritorio.
- [ ] **T86** `GamesPage` y `GameDetailPage` · **Cubre:** RF-2.x, RF-3.x, RF-4.x, RF-9.x, RF-10.x · **Hecho cuando:** `GameDetailPage` confirma antes de finalizar, y una partida `abortada` no ofrece finalizar.
- [ ] **T87** `PlayersPage` y `SeasonsPage` · **Cubre:** RF-1.x, RF-11.x · **Hecho cuando:** un jugador dado de baja conserva su histórico visible, y una temporada cerrada no admite partidas nuevas.
- [ ] **T88** `StatsPage` y `RankingsPage` · **Cubre:** RF-12.x, RF-13.x, RF-17.x · **Hecho cuando:** el ranking exige temporada elegida y cada cifra enlaza a las partidas que la componen.
- [ ] **T89** `LoginPage` · **Cubre:** RF-14.3, RF-15.4 · **Hecho cuando:** un intento de acceso no muestra detalles de cuenta ni información de otros usuarios.
- [ ] **T90** Router y guard de sesión · **Cubre:** RF-14.2, RF-15.1, RF-15.3 · **Hecho cuando:** una acción de captura sin sesión redirige al acceso y conserva lo escrito.

---

## Fase 13 · Seguridad y cierre — 4 tareas

- [ ] **T91** `firestore.rules` · **Cubre:** RF-14.1, RF-14.2, RF-15.1, RF-15.2, RF-15.5 · **Hecho cuando:** la lectura es pública, la escritura exige sesión y no hay ninguna regla con `admin`.
- [ ] **T92** `rules.test.ts` contra el emulador · **Cubre:** RF-14.1, RF-14.2, RF-15.1, RF-15.2 · **Hecho cuando:** un anónimo lee, un anónimo recibe `permission-denied` al escribir, y un autenticado escribe.
- [ ] **T93** Cobertura final y los cuatro en verde · **Cubre:** todos · **Hecho cuando:** `typecheck && lint && test && format:check` pasan en ese orden, y `test:coverage` mantiene el 100 % de `src/domain/`.
- [ ] **T94** Checklist de salida · **Cubre:** todos · **Hecho cuando:** las 10 condiciones de `plan.md` §8 están comprobadas una a una, y las 6 desviaciones de `../../docs/domain.md` §4.5 tienen su test.

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
| RF-12.5 | T64, T69 |
| RF-12.6 | T52 |
| RF-12.7 | T55 |
| RF-13.1 a RF-13.4, RF-13.6 | T54 |
| RF-13.5 | T64, T69 |
| RF-13.7 | T69, T71 |
| RF-14.1, RF-14.2 | T91, T92 |
| RF-14.3 | T89 |
| RF-14.4 | T76 |
| RF-15.1, RF-15.2 | T91, T92 |
| RF-15.3 | T90 |
| RF-15.4 | T70, T89 |
| RF-15.5 | T70, T91 |
| RF-15.6 | T58 |
| RF-15.7, RF-15.8 | T68, T81 |
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
| RNF-7 | T76, T91 |
| RNF-8 | T49, T61, T62 |

---

## Notas de mantenimiento

**Grano.** Si una tarea se pasa de 30 minutos, se parte en dos con sufijos: `T22a` y `T22b`. Hay cuatro
candidatas previsibles a partirse: **T22** (barrido de 100 celdas), **T55** (recalculate con las cuatro
fixtures), **T81** (TurnForm completa) y **T86** (dos páginas de captura).

**Puerta de dominio.** **T57** no es una tarea más: cierra la mitad de desarrollo. Si el 100 % de
`domain/` no se alcanza antes de empezar la fase 9, arrastrar el hueco hasta el final es mucho más caro que
cerrarlo aquí.

**Tareas sin RF propio, y es correcto.** T01 a T05 son el andamiaje que hace posible cumplir III.1, y T84
son estilos. El criterio 1 de `plan.md` §8 dice que eso se entrega en la primera tarea.

**Al reabrir un hallazgo.** Si una revisión futura de `../../docs/reviews/001-qa.md` reabre algo, se añade
una tarea nueva al final de la fase correspondiente en vez de editar una ya cerrada. Una tarea marcada no se
desmarca.
