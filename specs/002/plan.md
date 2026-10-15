# plan.md — Plan técnico de `specs/002`

Plan de corrección de la captura de turnos y de su trazabilidad a partir de [`spec.md`](spec.md). Este
documento define **cómo** se construye; la spec define **qué** se construye. Las rutas de este documento
son relativas a `specs/002/`.

| Documento | Papel |
| --------- | ----- |
| [`../../docs/constitution.md`](../../docs/constitution.md) | Principios no negociables. Se cita como `N.M`. |
| [`spec.md`](spec.md) | 59 requisitos en RF-18 a RF-22, 8 RNF, 48 casos límite, 28 criterios de finalización y 23 dudas resueltas. |
| [`../../docs/domain.md`](../../docs/domain.md) | Reglas de puntuación y conservación de puntos. |
| [`../../docs/reviews/002-qa.md`](../../docs/reviews/002-qa.md) | Traza de los 25 hallazgos y dónde se cerraron. |
| [`../../AGENT.md`](../../AGENT.md) | Convenciones de software. Este plan no puede contradecirlas. |
| `plan.md` | Este documento. |

---

## 1. Alcance y forma de trabajo

Se implementan las cinco cosas que 001 prometió y el código no cumple, más dos huecos de trabajo declarado.
El orden no es libre y cinco reglas lo imponen:

- **Constitution V.1**: todo cálculo vive en `domain/`, que es puro. El recorrido de turnos es cálculo, así
  que **no puede** vivir en un composable.
- **Constitution IV.1**: cobertura del 100 % en `domain/`. Los módulos nuevos entran con el umbral puesto,
  no con deuda inicial.
- **Constitution IV.2**: una función pura nueva sin test es trabajo incompleto. Se escribe el test antes que
  la función.
- **RF-18.13**: los campos capturados no se re-derivan. Por eso el recorrido recibe turnos y devuelve turnos
  nuevos, en vez de mutar los que hay.
- **RF-18.15**: la re-derivación vuelve a comprobar los yaku de viento, porque **con la localía real el
  motor tiene que saber quién es el dealer**. De ahí la fase 1.

`../../docs/constitution.md` **no se toca**: ningún principio necesita enmienda. Ninguna dependencia se
añade, así que `../../AGENT.md` → Rules se respeta sin excepción (II.1, II.2).

### 1.1 · El precondition que cambia la forma del plan

`dealerId` se captura y se persiste, pero **no influye en ningún pago**:

| Sitio | Qué dice |
| ----- | -------- |
| `domain/turn.ts:194` | `const winnerIsDealer = player.seat === 'east'` |
| `domain/turn.ts:277` | `-(player.seat === 'east' ? winning.dealerShare : winning.nonDealerShare)` |
| `components/turns/TurnForm.vue:360` | `const dealerIsEast = …dealerId.value)?.seat === 'east'` |

El sistema entero entiende por dealer a «quien ocupa el asiento Este», para siempre. Hoy no se nota porque
la partida empieza con el Este de dealer y los fixtures de `turn.test.ts` solo miden el primer turno.
**En cuanto RF-18 haga avanzar la localía, los pagos se calcularán contra el asiento equivocado y
`checkSquare` no lo detectará**, porque los deltas seguirán cuadrando igual: es un error que cambia puntos
reales y es invisible.

Por eso la fase 1 es bloqueante y va antes que todo: sin dealer real, la re-derivación calcula estados
correctos sobre pagos incorrectos.

---

## 2. Orden de ejecución

| Fase | Contenido | Por qué aquí |
| ---- | --------- | ------------ |
| 0 | **Cerrar el mecanismo en `specs/001/spec.md`** y en `../../docs/domain.md`, con las tres derogaciones | Constitution I.1 y `AGENT.md` → Rules: la spec declara antes de codificar. Como ya hizo la fase 14 de 001 con RF-15.9 |
| 1 | **`resolveTurn` recibe el dealer real** en `domain/turn.ts` | Precondition del punto 1.1. Bloquea la fase 2 |
| 2 | `domain/replay.ts`: recorrido de turnos, re-derivación hacia delante y hacia atrás | Necesita el dealer real. Es el corazón de RF-18 |
| 3 | `domain/yaku.ts`: campo de condiciones y `sumYakuHan` | Alimenta la fase 6 y es la parte de dominio con más riesgo |
| 4 | `data/turns.repository.ts`: auditoría, conflicto, borrado e identificador sin relleno | Necesita el recorrido de la fase 2 para validar antes de escribir |
| 5 | `data/games.repository.ts` (`turnAudit[]`) y `composables/useGameTurns.ts` | Capa de escritura, ya con el dominio listo |
| 6 | `TurnForm.vue`, `data/errors.ts` e i18n | La interfaz recoge salidas del motor y pinta sus rechazos |
| 7 | Fixtures y tests de RNF-1, RNF-3 y RNF-5 por comportamiento, con el experimento de red previo | Cierra RNF-6 de la spec, el requisito que cambia el tipo de test |
| 8 | Verificación constitution III.1 | `typecheck` → `lint` → `test` → `format:check` |

**Fuera del alcance:** 003 (interfaz), 004 (dora y fichas), 005 (M.League) y el final de una ronda.

### 2.1 · Fase 0 · Cerrar el mecanismo en 001

Es la fase que la spec §4 y §10.6 exigen, y la única que **no se puede hacer bajo el encargo de redactar
002**: constitution I.1 dice que `specs/` no se modifica sin petición explícita, y `AGENT.md` → Rules lo
repite. Por eso está aquí, y por eso el checklist de §8 la pone como condición 11.

Qué escribe, y dónde:

| # | Dónde | Qué |
| - | ----- | --- |
| 0.1 | `specs/001/spec.md` §4 | Derogar **RF-3.13**: el han de yaku, el honba y la localía pasan a calcularlos el sistema |
| 0.2 | `specs/001/spec.md` §4 | Derogar **RF-4.3**: el disparador pasa a ser «no haber seleccionado ningún yaku real» |
| 0.3 | `specs/001/spec.md` §4 | Derogar **RF-6.5**: el suufon renta queda vetado por decisión del club |
| 0.4 | `specs/001/spec.md` §9 | Añadir las dudas que conteste la fase 3, con su decisión |
| 0.5 | `specs/001/spec.md` §7 | Registrar el suufon renta como caso pendiente de decisión de reglas, si el club lo confirma antes de empezar |
| 0.6 | `../../docs/domain.md` §2 | Anotar que los cuatro ganadores por tsumo quedan fuera de lo capturado |
| 0.7 | `../../docs/reviews/002-qa.md` | Constar que la fase 0 está cerrada, con la fecha y el encargo que la autorizó |

**Condición de cierre:** las seis primeras filas están escritas y `docs/reviews/002-qa.md` apunta a ellas.
Si la fase 0 no está cerrada, la fase 1 no empieza. No es una formalidad: una tarea marcada que se abre
sobre un requisito derogado produce código que parece una violación de 001.

**Lo que la fase 0 NO hace:** no toca `AGENT.md`. Los cambios de modelo de datos de 001 van en el anexo de
§10 de este plan, en su propia tarea, porque son documentación de convenciones y no derogación de
requisitos.

---

## 3. Módulos

### 3.1 `domain/` — puro, sin Vue, sin Firebase, sin DOM, 100 % de cobertura

| Módulo | Qué añade o cambia | RF que cubre |
| --- | --- | --- |
| `rules.ts` | **No cambia.** `nextHand()` ya calcula ronda, localía y honba, y trabaja sobre `Seat`, no sobre `PlayerId`: la rotación de asientos se reutiliza tal cual. Solo se le añade el estado inicial de RF-18.2 | RF-18.2, RF-18.3, RF-18.4, RF-18.5, RF-18.6 |
| `turn.ts` | `TurnInput` gana `dealerId` en `TurnBase`; `toWin` y `deltaFromWin` dejan de mirar `seat === 'east'` | RF-18.1, RF-18.8, RF-21.4 |
| **`replay.ts`** *(módulo nuevo)* | `replayTurns(players, turnos, desdeTurno)` → turnos re-derivados, marcador y cierre por bancarrota. Envuelve `resolveTurn`, `nextHand`, `checkSquare` y `validateWindYaku`, y rechaza si un turno posterior no valida | RF-18.7 a RF-18.17, RF-18.19 |
| `yaku.ts` | `YakuDefinition` gana `conditions`; `sumYakuHan(yaku, contexto)` suma solo los que cuentan y excluye los de límite | RF-22.1 a RF-22.4 |
| `handValue.ts` | **No cambia.** Ya recibe `winnerIsDealer` como booleano, así que el dealer real le llega sin tocar la fórmula | — |
| `game.ts` | **No cambia.** `finalizeResults` y `playerScore` ya consumen deltas; la re-derivación les pasa los nuevos | RF-18.12 |
| `seasons.ts`, `uma.ts`, `ranking.ts`, `stats.ts`, `stats/recalculate.ts` | **No cambian.** La asignación a temporada no se toca y los agregados ya se recalculan desde `games[]` | RF-18.12 |

`replay.ts` va aparte y no dentro de `game.ts` por la misma razón por la que 001 decisión 13 separó
`game.ts` de `rules.ts`: el recorrido necesita a la vez los deltas de `turn.ts`, la rotación de `rules.ts` y
la validación de viento de `yaku.ts`, y colapsarlo obligaría a `game.ts` a importar tres módulos que hoy no
conoce.

### 3.2 `data/` — único lugar que importa de `firebase/*`

| Fichero | Qué cambia | RF |
| --- | --- | --- |
| `errors.ts` | Códigos nuevos: `conflict`, `auditFull`, `staleLocal`, `suufonRejected` | RF-19.12, RF-19.14, RF-19.15, RF-21.5 |
| `turns.repository.ts` | `update` pasa a lectura-verificación; `remove` nuevo; `turnDocId` sin relleno; escritura del `audit[]` | RF-19.1 a RF-19.14, RF-18.10, RF-20.1 |
| `games.repository.ts` | El documento acepta `turnAudit[]` | RF-19.7 |
| `batch.ts` | **No cambia.** Ya encadena escrituras en un único `WriteBatch` | RF-18.14 |

Ningún repositorio calcula reglas de negocio: recibe del `domain/` el turno ya resuelto y lo persiste.
`assertOpenGame` sigue rechazando `finalized`, lo que cubre RF-18.18 sin código nuevo.

### 3.3 `queries/` y `composables/`

| Fichero | Qué cambia | RF |
| --- | --- | --- |
| `queries/turns.ts` | Sin cambios de clave. `list` ya ordena por `turnNo` numérico, que es lo que exige RF-20.2 | RF-20.2 |
| `useGameTurns.ts` | `correctTurn` invoca `replayTurns` y persiste corregido, re-derivados y derivados de temporada en un solo `WriteBatch`; `deleteTurn` nuevo; comprobación de estado desfasado antes de escribir | RF-18.7, RF-18.9, RF-18.12, RF-18.14, RF-19.4, RF-19.15 |
| `useGames.ts` | `finalsOf` recibe los turnos re-derivados en lugar de los guardados | RF-18.12 |
| `useSeasons`, `usePlayers`, `useRankings`, `usePlayerSeasonStats` | **No cambian** | — |

**002 toca la interfaz, y hay que decirlo.** La spec deja trece requisitos de interfaz para 003, pero
RF-18.1, RF-21 y RF-23 obligan a cambiar `TurnForm.vue` en esta fase: los tres desplegables de localía,
viento y honba pasan a ser de solo lectura; el ganador pasa a admitir hasta tres; los han se suman solos; y
el formulario se limpia al guardar. Lo que va a 003 es lo que **no** lo exige ningún RF de 002.

### 3.4 `components/` y `pages/`

| Pieza | Qué cambia | RF |
| --- | --- | --- |
| `forms/TurnForm.vue` | Localía, ronda y honba pasan a mostrarse y no a capturarse; lista de ganadores con el descartador excluido; han derivados con desglose y ajuste; limpieza del formulario y del borrador | RF-18.1, RF-21.1 a RF-21.3, RF-21.5, RF-22.5, RF-22.6, RF-23.1 a RF-23.3 |
| `pages/GameDetailPage.vue` | Muestra el estado derivado de la mano siguiente y el aviso de re-derivación inválida | RF-18.16, RF-23.3 |
| `ui/`, `layout/`, `charts/` | **No cambian** | — |

---

## 4. Modelo de datos

### 4.1 Cambios en `games/{gameId}`

Se añade un campo:

```
turnAudit[]: { at, by, action: 'delete', turnNo, before: { …valores del turno borrado… } }
```

Solo lo reciben los borrados sin turno anterior (RF-19.7). Es el único sitio donde puede sobrevivir un
registro sin que el propio borrado se lo lleve por delante.

### 4.2 Cambios en `games/{gameId}/turns/{turnNo}`

| Campo | Cambio | Por qué |
| ----- | ------ | ------- |
| ID del documento | `String(turnNo)`, **sin relleno** | RF-20.1; el techo de 99 turnos desaparece |
| `dealerId` | **Pasa a ser real**: ahora manda en los pagos | Punto 1.1 |
| `wind`, `honba` | **Pasan a derivados**: se reescriben, no se capturan | RF-18.7 |
| `yakuHan` | Pasa a ser **salida** de `sumYakuHan`, no entrada | RF-22.1 |
| `yakuHanOverride` | **Nuevo**: el ajuste a mano como delta | RF-22.9 |
| `updatedBy` | **Nuevo**: quién corrigió por última vez | RF-19.2 |
| `updatedAt` | **Nuevo**: cuándo | RF-19.2 |
| `audit[]` | **Nuevo**: `{ at, by, action: 'correct', changes: [{ field, from, to, derived }] }` | RF-19.3, RF-19.4 |

`capturedBy` se queda **inmutable** (RF-19.1) y `audit[]` se declara de solo anexado, con la salvedad
escrita de RF-19.13: la inalterabilidad la garantiza el cliente, porque `firestore.rules` concede escritura
sobre el documento completo y no puede impedir que un array se sobrescriba entero.

### 4.3 Índices compuestos requeridos

**Ninguno nuevo.** El registro vive dentro de documentos que ya se leen enteros, y `turnAudit[]` dentro
del juego. Es el beneficio directo de haber elegido el array: nada aquí toca grupos de colección, que es lo
que costó tres arreglos seguidos en T105, T106 y T107.

### 4.4 Escritura

Una mutación, un `WriteBatch`. Corregir el turno N escribe:

1. el turno N corregido, con su entrada de `audit[]`;
2. los turnos N+1..M re-derivados, cada uno con la suya;
3. `playerSeasonStats` y `rankings` de la temporada, vía `rewriteSeasonDocs`;
4. `games.mustFinalize` recalculado, si cambió.

Todo en el mismo lote, de modo que un fallo no deje la partida a medio recalcular (RF-18.14).

### 4.5 Reglas de seguridad

**No hay cambio en `firestore.rules`.** Los registros nuevos están dentro de documentos cuya escritura ya
exige sesión, y la lectura ya es pública. La inalterabilidad del `audit[]` no se intenta con reglas: se
consigue con la lectura-verificación de RF-19.12, que rechaza antes de pisar.

---

## 5. Decisiones justificadas con la alternativa descartada

Las trece que más condicionan el código. Cada una lleva lo que se habría hecho en su lugar, por qué no, y
el riesgo que queda asumido.

| # | Decisión | Alternativa descartada | Por qué | Riesgo asumido |
| --- | --- | --- | --- | --- |
| 1 | **`resolveTurn` recibe `dealerId`** | (a) Que la re-derivación corrija el dealer solo al escribir; (b) que `TurnPlayer` lleve `isDealer` | (a) deja el motor mintiendo y el error seguiría invisible; (b) duplica el asiento en dos sitios y obliga a mantenerlos sincronizados | Cambian los pagos de los turnos 2..N. Es la corrección de un fallo real, y por eso lleva fase propia y test propio |
| 2 | **`domain/replay.ts` como módulo nuevo** | Colapsarlo en `game.ts` | El recorrido necesita a la vez deltas, rotación y validación de viento. `game.ts` hoy no importa ninguno de los tres, y meterlo lo ataría a `turn.ts` y a `yaku.ts` | Un módulo más en la estructura de carpetas de `AGENT.md` |
| 3 | **La re-derivación devuelve turnos nuevos, no muta los existentes** | (a) Mutar en sitio; (b) recalcular el marcador solo al finalizar | (a) impide rechazar una operación inválida sin escribir nada, que es lo que exige RF-18.16; (b) es exactamente el fallo actual, y deja mal el bote que RF-5.6 promete consultar | Copia los turnos en memoria: en una partida real son de 8 a 20, despreciable |
| 4 | **El registro es un array en el turno** | Subcolección `turns/{turnNo}/audit` | Escala mejor, pero reproduce lo que costó tres arreglos seguidos en T105 a T107: regla recursiva, índice de alcance grupo y una regla más que mantener | El documento crece; se acota con RF-19.14 |
| 5 | **El registro del borrado va en el turno anterior, con `games.turnAudit[]` de respaldo** | (a) En el turno borrado; (b) siempre en la partida | (a) es imposible: el borrado se lleva el registro por delante. (b) mezcla dos auditorías distintas en un documento y obliga a consultar dos sitios para leer un turno | El turno anterior pasa a formar parte de la historia, así que borrarlo añade una escritura más |
| 6 | **Rechazo por lectura-verificación** | (a) Transacción de Firestore; (b) última escritura gana; (c) subcolección | (a) exige soporte transaccional y no ayuda: el conflicto nace entre dos clientes que no comparten transacción. (b) pierde correcciones y contradice RNF-2. (c) es la alternativa 4 | Dos lecturas por corrección. En la mesa es instantáneo |
| 7 | **`yakuHan` derivado, con `yakuHanOverride` como delta** | (a) Seguir tecleándolo; (b) derivarlo sin override; (c) guardar solo el total | (a) es el error que 002 viene a cerrar. (c) pierde la distinción entre catálogo y persona, que es lo que hace útil el desglose de RF-22.6 | Un campo más en el turno. (b) bloquearía a quien sabe más que el catálogo |
| 8 | **`YakuDefinition` gana `conditions`** | (a) Reglas sueltas fuera del catálogo; (b) clasificarlos a mano en el formulario | (a) deja la regla en la interfaz, que es donde 001 ya falló con la localía; (b) es el mismo error repetido | Toca `YAKU_CATALOG`, que alimenta tres consumidores a la vez: la suma, la validación de viento y las estadísticas |
| 9 | **Identificador del turno sin relleno** | (a) Relleno a cuatro dígitos; (b) mantener dos y acapar el caso de 100 turnos | (b) deja un techo; (a) mueve el problema sin resolverlo y obliga a ampliar más adelante | Las partidas existentes, que no hay, habría que migrarlas |
| 10 | **Sin cambio en `firestore.rules`** | Regla con `diff().affectedKeys()` sobre `audit` | Firestore no permite proteger un subcampo de un documento que también se escribe entero, y probar que el array solo crece es frágil | La inalterabilidad la garantiza el cliente. Declarado en RF-19.13, no escondido |
| 11 | **Sin índices nuevos** | Subcolección de auditoría | Con el array no hay nada que indexar | Ninguno |
| 12 | **Límite de documento comprobado en cliente** | (a) Sin límite; (b) consolidar el registro | (a) deja que un turno corregido muchas veces acabe en `failed-precondition` sin explicación, en mitad de una partida. (b) perder el detalle intermedio contradice RF-19.5 | Hay que estimar el tamaño de la escritura antes de enviarla |
| 13 | **El suufon renta se deroga, no se implementa** | (a) Implementarlo; (b) declararlo imposible sin más | (a) cuesta poco y el motor ya lo resuelve, pero el club decidió vetarlo. (b) sería escribir una afirmación técnica que el propio repositorio desmiente en cuatro sitios | El motor conserva código sin camino de entrada. Documentado en RF-21.5 y §7 de la spec |

### 5.1 Decisiones de estructura de código

| # | Decisión | Alternativa descartada | Por qué |
| --- | -------- | --------------------- | ------- |
| 14 | El campo se llama `derived` en el registro, no `origen` | `origen`, con valores `captured` y `computed` | `derived` se lee en inglés junto al resto del modelo, donde los campos son `camelCase` en inglés |
| 15 | `replayTurns` recibe `desdeTurno` para no reprocesar el pasado | Rehacer la partida entera en cada corrección | Corregir el turno 1 de una partida de 20 toca 20 documentos, pero corregir el 18 toca 2. El coste del peor caso no cambia y el del típico cae |
| 16 | La re-derivación **no** toca `isRenchan` ni `isFinalTurn` en su contrato | Incluirlos como estado derivado | El hallazgo D8 de la revisión constató que **ninguno de los dos campos lo lee nadie**, y que `isFinalTurn` se calcula como `turnNo >= minTurns`, lo que marca como final todo turno desde el cuarto. No hay definición de qué es el turno final de una partida que se prolonga, y fabricarla sería inventar una regla |

---

## 6. Estrategia de tests

### 6.1 Niveles y umbrales

| Nivel | Qué cubre | Umbral |
| --- | --- | --- |
| `src/__tests__/<módulo>.test.ts` | Una función pura por módulo | **100 % líneas, ramas y funciones** (constitution IV.1) |
| `src/__tests__/<módulo>.test-d.ts` | Tipos, IDs con marca y uniones de literales | Los comprueba `typecheck`, no Vitest |
| `src/__tests__/fixtures/` | Partidas completas reutilizables | — |
| `src/__tests__/*.test.ts` de componentes | Validación de formularios y render | Sin umbral, se reporta |
| `src/__tests__/*.test.ts` de `data/` | Repositorios con Firestore simulado | Sin umbral, se reporta |
| `src/__tests__/offline.test.ts` | Captura sin red: RNF-5 por comportamiento | Sin umbral, se reporta |

El único umbral bloqueante sigue siendo el de `domain/`, tal como fija constitution IV.1.

**Un test por módulo, y solo uno** (`AGENT.md`). Los barridos van dentro, en un `describe` propio. Como
`replay.ts` es un módulo nuevo, `replay.test.ts` es su fichero: su barrido no se reparte entre `game.test.ts`
y `turn.test.ts`.

### 6.2 Los cuatro barridos que más valor dan

Son tests de invariante, no de ejemplo: barren combinaciones en vez de comprobar casos sueltos.

| `describe` | Qué barre | Por qué |
| --- | --- | --- |
| `replay.test.ts` → `'reproducción'` | Cada tipo de resultado × localía × renchan × corrección en cada posición del turno | Es RNF-1 y RNF-3 leídos al revés: si el recorrido depende del orden de corrección, el barrido lo encuentra |
| `replay.test.ts` → `'ida y vuelta'` | Corregir un turno y deshacer la corrección devuelve el estado de partida | Es la mitad de RNF-1 que no se puede comprobar con un ejemplo suelto |
| `yaku.test.ts` → `'yaku situacionales'` | Cada yaku con condición, en su contexto válido y en tres contextos inválidos | Cierra el hallazgo A4, el que proponía sumas imposibles |
| `turn.test.ts` → `'dealer real'` | Cada forma de resultado con el dealer en cada uno de los cuatro asientos | Cierra el punto 1.1: hoy el asiento Este es el dealer en todos los casos |

### 6.3 Tests de determinismo y de reproducción

| Test | Qué comprueba | RF |
| --- | --- | --- |
| `replay.test.ts` → `'mismo input, mismo output'` | La misma partida con las claves del objeto en distinto orden produce turnos idénticos | RF-18.7, RNF-1 |
| `replay.test.ts` → `'conservación de puntos'` | Tras corregir, la suma de deltas vuelve a la fórmula de `docs/domain.md` §5, con chombo y con bote sin reclamar | Criterio 4 |
| `replay.test.ts` → `'rechazo entero'` | Una corrección que invalida un turno posterior no escribe ningún documento | Criterio 6 |

### 6.4 Fixtures

`src/__tests__/fixtures/` tiene hoy **una**: `temporadaCompleta.ts`. La fase 7 añade las tres que 001 §6.4
declaró y nunca creó ——`tonpuusenSencilla`, `hanchanConTodo` y `partidaConChombo`—— porque el criterio 24
de la spec exige que **una partida completa con reparto de riichi se recorra de extremo a extremo**, y eso
necesita al menos `hanchanConTodo` con cuatro declaraciones de riichi, un ron múltiple y un chombo.

### 6.5 El experimento previo de la red

El criterio 26 de la spec es el único que puede no cumplirse, y su propio texto lo dice. La fase 7 lo
trata como riesgo y no como formalidad:

1. **Experimento acotado, antes de nada.** ¿Se puede cortar la red en `happy-dom` de forma que el SDK de
   Firestore encole la escritura y la sincronice después? Si no se puede, **el criterio se declara fuera de
   alcance por escrito y no se da por cumplido**: es preferible un criterio retirado con motivo a un test
   que se salta sin que nadie lo note, que es lo que pasó con `rules.test.ts` hasta T92.
2. Solo si el experimento sale bien, `offline.test.ts` corta la red, registra un turno, la restaura y
   comprueba que llega al servidor.

### 6.6 Verificación por tarea

Al terminar cada tarea, los cuatro en verde y en este orden (constitution III.1):

```
npm run typecheck && npm run lint && npm run test && npm run format:check
```

Antes de cerrar la fase 3: `npm run test:coverage`, que tiene que dar 100 % en `src/domain/` o la tarea
se declara incompleta. Un fallo ajeno al cambio se declara en la respuesta; no se oculta ni se salta un
paso.

---

## 7. Trazabilidad RF → módulo → test

| RF | Módulo o capa | Test |
| --- | --- | --- |
| RF-18.1, RF-18.8 | `domain/turn.ts` | `turn.test.ts` → `'dealer real'` |
| RF-18.2 a RF-18.6 | `domain/rules.ts` | `rules.test.ts` |
| RF-18.7 a RF-18.10 | `domain/replay.ts` | `replay.test.ts` |
| RF-18.11, RF-18.12 | `domain/replay.ts`, `composables/useGames.ts` | `replay.test.ts`, `useGames.test.ts` |
| RF-18.13, RF-18.14 | `data/turns.repository.ts`, `useGameTurns.ts` | `turns.repository.test.ts` |
| RF-18.15 a RF-18.17 | `domain/replay.ts` | `replay.test.ts` → `'rechazo entero'` |
| RF-18.18 | `data/turns.repository.ts` (`assertOpenGame`) | `turns.repository.test.ts` |
| RF-18.19 | `useGameTurns.ts` | `useGameTurns.test.ts` |
| RF-18.20, RF-18.21 | `domain/replay.ts` | `replay.test.ts` |
| RF-19.1 a RF-19.5 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-19.6, RF-19.7 | `data/turns.repository.ts`, `data/games.repository.ts` | `turns.repository.test.ts`, `games.repository.test.ts` |
| RF-19.8 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-19.10 | `pages/GameDetailPage.vue` | `GameDetailPage.test.ts` |
| RF-19.12, RF-19.13 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-19.14 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-19.15, RF-19.16 | `useGameTurns.ts` | `useGameTurns.test.ts`, `offline.test.ts` |
| RF-20.1 a RF-20.3 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RF-21.1 a RF-21.5 | `components/forms/TurnForm.vue` | `TurnForm.test.ts` |
| RF-22.1 a RF-22.4 | `domain/yaku.ts` | `yaku.test.ts` → `'yaku situacionales'` |
| RF-22.5 a RF-22.9 | `domain/yaku.ts`, `TurnForm.vue` | `yaku.test.ts`, `TurnForm.test.ts` |
| RF-23.1 a RF-23.5 | `components/forms/TurnForm.vue` | `TurnForm.test.ts` |
| RNF-1, RNF-3 | `domain/replay.ts` | `replay.test.ts` → `'reproducción'` |
| RNF-2 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RNF-4 | `useGameTurns.ts` | `offline.test.ts` |
| RNF-5 | `useGameTurns.ts` | `batch.test.ts` |
| RNF-6 | Transversal | `offline.test.ts`, `replay.test.ts` |
| RNF-7 | `data/turns.repository.ts` | `turns.repository.test.ts` |
| RNF-8 | `data/turns.repository.ts` | `turns.repository.test.ts` |

---

## 8. Checklist de salida

| # | Condición | Origen |
| --- | --------- | ------ |
| 1 | Los cuatro comandos en verde, en orden | Constitution III.1 |
| 2 | 100 % de líneas, ramas y funciones en `src/domain/` | Constitution IV.1 |
| 3 | Toda función pura de `domain/` con su test nombrado como el módulo | Constitution IV.2 |
| 4 | `any` inexistente; `strict` y `noUncheckedIndexedAccess` sin relajar | Constitution VI.1 |
| 5 | El narrowing se hace desde `state.status` | Constitution VI.2 |
| 6 | Ningún import de `firebase/*` fuera de `data/` y `app/firebase.ts` | Constitution V.1 |
| 7 | Exactamente dos stores, ninguno consumiendo `useQuery()` | Constitution V.2 |
| 8 | `lint` ejecutado en modo check, sin mutar ficheros | Constitution III.1 |
| 9 | Los tres RF derogados escritos en `specs/001/spec.md` | Regla de `spec.md` §4 |
| 10 | Ningún campo nuevo sin fila en la tabla de derogaciones de `spec.md` §4 | Hallazgo C2 |
| 11 | **La fase 0 cerrada antes de empezar la fase 1** | Constitution I.1 |
| 12 | El experimento de red hecho y su resultado escrito, sea éxito o no | Criterio 26 de la spec |

---

## 9. Riesgos y cómo se mitigan

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| La fase 1 rompe pruebas que hoy pasan | Un commit ruidoso que parece un fallo | Los cambios de `turn.test.ts` son **actualización de fixtures**, no correcciones: el dealer pasa de implícito a explícito. Se dice en el mensaje del commit |
| El campo `conditions` de `YAKU_CATALOG` toca tres consumidores | Regresión en la suma, en la validación de viento y en las estadísticas | Fase 3 aislada, con su propio barrido, antes de tocar la interfaz |
| Una corrección escribe N documentos | Latencia perceptible en una partida larga | Entre 8 y 20 escrituras, muy por debajo de las 500 del lote de Firestore; y RF-19.14 acota el caso en que el registro crezca |
| El test sin red no resulta alcanzable | El criterio 26 no se cumple | El experimento previo de §6.5 va **primero**, y el criterio se retira por escrito si falla |
| El `audit[]` supera el 1 MiB del documento | Un turno deja de poder corregirse | RF-19.14 rechaza con su mensaje antes de llegar a Firestore |
| El recorrido de turnos no resulta puro | Constitution V.1 violada y cobertura no verificable | El recorrido no recibe nada que no sea un turno ya leído y no devuelve nada que no sean datos. Test de determinismo con las claves en distinto orden |
| La re-derivación lee turnos desfasados | Resultado silenciosamente incorrecto | RF-19.15 rechaza y pide sincronizar; RF-19.16 no pierde la captura pendiente |

---

## 10. Lo que este plan no cubre

- **003, 004 y 005.** Interfaz de lectura, verificación de la mano y M.League.
- **El final de una ronda.** La progresión es secuencial e independiente de `gameLength`, declarado como
  limitación en `spec.md` §7.
- **`isFinalTurn` e `isRenchan`.** El hallazgo D8 constató que son campos muertos y que `isFinalTurn` se
  calcula mal. Ningún RF los pide, y fabricar una definición de «turno final» para una partida que se
  prolonga sería inventar una regla. Se deja constancia y no se tocan.
- **La inalterabilidad del registro impuesta por `firestore.rules`.** Declarado en RF-19.13.
- **Migración de partidas existentes.** El club no tiene ninguna.

---

## Anexo · Cambios que este plan obliga a hacer en `../../AGENT.md`

`AGENT.md` enumera de forma exhaustiva los módulos de `domain/` y el modelo de datos. Este plan introduce
cambios, así que la lista se actualiza en su propia tarea para que no quede desalineada:

| Cambio | Motivo |
| --- | --- |
| `domain/replay.ts` añadido a la estructura de carpetas y a la tabla de responsabilidades | Decisión 2 de §5 |
| La fila de `turns/{turnNo}` en Data model: quitar el relleno a dos dígitos y añadir `updatedBy`, `updatedAt`, `audit[]` y `yakuHanOverride` | RF-20.1, RF-19.2, RF-19.3, RF-22.9 |
| La fila de `games/{gameId}` en Data model: añadir `turnAudit[]` | RF-19.7 |
| Retirada la nota «ID como string con relleno a dos dígitos, para que el orden lexicográfico sea el cronológico» | Decisión 9 de §5 |
| Ampliada la nota de `dealerId`: pasa a ser el campo que manda en los pagos | Punto 1.1 |