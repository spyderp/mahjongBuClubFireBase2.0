# tasks.md — Tareas de `specs/002`

Listado de trabajo derivado de [`spec.md`](spec.md) y [`plan.md`](plan.md). El plan dice **qué** se
construye y en qué orden; este documento lo parte en tareas de 20 a 30 minutos.

## Cómo se usa

- Cada tarea es un `- [ ]`. **Marca la casilla solo cuando el «Hecho cuando» de esa tarea se cumple.**
- Para saber qué falta:

  ```bash
  grep -c '^- \[ \]' specs/002/tasks.md
  grep -n '^- \[ \]' specs/002/tasks.md
  ```

- Las tareas van en **orden de dependencias**: nada empieza antes de que su bloque termine.
- **La fase 0 no se puede hacer bajo este encargo.** Constitution I.1 dice que `specs/` no se modifica sin
  petición explícita, y la fase 0 escribe en `../001/spec.md`. Antes de T01 hace falta que alguien pida esa
  modificación de forma explícita.
- **Constitution III.1 se verifica al terminar cada tarea**, no al final:

  ```bash
  npm run typecheck && npm run lint && npm run test && npm run format:check
  ```

  `lint` es solo check. Un fallo ajeno al cambio se declara en la respuesta; no se oculta ni se salta un
  paso.
- **Constitution IV.1**: antes de cruzar cada puerta de dominio, `npm run test:coverage` tiene que dar
  100 % de líneas, ramas y funciones en `src/domain/`.
- Los ficheros del proyecto viven en la raíz del repositorio. Las rutas de este documento son relativas
  a `specs/002/`, así que `docs/domain.md` se escribe `../../docs/domain.md` y `../001/spec.md`.

**Estimación:** 47 tareas · 35 a 50 horas.

---

## Fase 0 · Cerrar el mecanismo en 001 — 3 tareas

Abre el plan. Ninguna cubre RF de 002: es lo que permite que las demás no se escriban sobre requisitos ya
derogados. Una tarea marcada de 001 no se desmarca: aquí se **añade** la derogación.

> **✅ Cerrada el 2026-10-14**, autorizada por encargo explícito del club en la sesión de trabajo de esa
> fecha, como exige constitution I.1. El registro completo está en
> [`../../docs/reviews/002-qa.md`](../../docs/reviews/002-qa.md) → *Fase 0*.

- [x] **T01** Las tres derogaciones en `../001/spec.md` · **Cubre:** RF-3.13, RF-4.3, RF-6.5 de 001 · **Hecho cuando:** `spec.md` de 001 tiene las tres filas en su tabla de RF derogados de 002, cada una con su RF sustituto, y `grep -c 'RF-3.13' ../001/spec.md` devuelve un número mayor que antes.
- [x] **T02** La nota de `../../docs/domain.md` §2 y el registro de la fase 0 · **Cubre:** RF-6.5 de 001 · **Hecho cuando:** `docs/domain.md` §2 dice que los cuatro ganadores por tsumo quedan fuera de lo capturado, y `../../docs/reviews/002-qa.md` tiene una línea que dice que la fase 0 está cerrada, con la fecha y el encargo que la autorizó.
- [x] **T03** `../../AGENT.md` con el anexo del plan · **Cubre:** RF-19.2, RF-19.3, RF-19.7, RF-20.1, RF-22.9 · **Hecho cuando:** la estructura de carpetas incluye `domain/replay.ts`, la fila de `turns/{turnNo}` ya no trae el relleno a dos dígitos y lista `updatedBy`, `updatedAt`, `audit[]` y `yakuHanOverride`, la fila de `games/{gameId}` lista `turnAudit[]`, y la nota de `dealerId` dice que manda en los pagos.

**Comprobado, tarea por tarea.** Las cinco filas del anexo de `plan.md` §10 están, cada una verificada con
script: `domain/replay.ts` aparece en la estructura de carpetas **y** en la tabla de responsabilidades;
`turns/{turnNo}` ya no dice «ID como string con relleno a dos dígitos» y lista los cuatro campos nuevos;
`games/{gameId}` lista `turnAudit[]`; y la nota de `dealerId` dice que **manda en los pagos**. Los tres
contadores de `grep -c` de T01 pasaron de 1 a 2 en los tres RF.

**Lo que esta fase NO es.** No toca `src/`: la suite salió idéntica antes y después, 528 pasados en ambos
casos. No hay test que escribir aquí y por eso no se ejecutó `coverage`. Ninguna tarea de 001 se desmarca:
lo que se añade es la derogación, en una sección nueva.

---

## Fase 1 · El dealer real — 3 tareas

Abre con un bug, no con una funcionalidad. **Nada empieza aquí sin la fase 0 cerrada**, y nada de la fase
2 empieza sin esta.

> **✅ Cerrada el 2026-10-14.** El dealer ya no se deduce del asiento: lo decide `dealerId`. Cuatro
> comandos en verde y el 100 % de `src/domain/` mantenido.

- [x] **T04** `TurnInput` recibe `dealerId` · **Cubre:** RF-18.1 · **Hecho cuando:** `TurnBase` tiene `dealerId: PlayerId`, y ni `toWin` ni `deltaFromWin` comparan ya ningún asiento con `'east'`: `grep -c "=== 'east'" domain/turn.ts` devuelve 0.
- [x] **T05** Fixtures de `turn.test.ts` con el dealer explícito · **Cubre:** RF-18.1 · **Hecho cuando:** `turn.test.ts` no construye ningún `TurnInput` sin `dealerId` y la suite sigue en verde sin cambiar ninguna aserción.
- [x] **T06** `describe('dealer real')` · **Cubre:** RF-18.1, RF-18.8, RF-21.4 · **Hecho cuando:** el barrido recorre tsumo, ron, empate y chombo con el dealer en los cuatro asientos, y hay un caso donde el dealer es el asiento Sur que produce los pagos distintos de los que daría el Este.

**Orden real: los tests antes que el código**, como pide constitution IV.2. Se escribió primero
`describe('dealer real')` con `dealerId` en el fixture, y el typecheck dio ocho errores `TS2353` —«'dealerId'
does not exist in type 'TurnBase'»— antes de tocar una línea de `domain/turn.ts`.

**T04.** `grep -c "=== 'east'" src/domain/turn.ts` devuelve **0**. Las dos comparaciones por asiento
—`winnerIsDealer` en `toWin` y el reparto de `deltaFromWin`— comparan ahora `playerId` contra
`input.dealerId`.

**T05.** El fixture se toca en **un solo punto**: `base()`, con `dealerId: overrides?.dealerId ?? A`. El
valor por defecto es el asiento Este, que es lo que el motor daba por hecho antes, así que **ninguna
aserción existente cambia**. Verificado con `git diff`: el único cambio en el código de test ya existente
es esa línea.

> **Lo que la tarea no decía y hubo que tocar.** El «Hecho cuando» de T05 habla solo de `turn.test.ts`,
> pero el typecheck es bloqueante (constitution VI.1) y cambiar `TurnBase` rompe a todo el que construye
> un `TurnInput`. Hicieron falta dos líneas más: el `base()` de `game.test.ts`, que tiene su propia copia,
> y el `base` que `TurnForm.vue` construye. La del componente **preserva el comportamiento actual** —el
> formulario ya capturaba `dealerId` y solo lo usaba para calcular `dealerIsEast`—, así que no adelanta
> nada de la fase 6. Sin esas dos líneas el build no cierra, y una fase que deja el typecheck rojo no es
> una fase.

**T06.** 19 tests nuevos: cuatro formas de resultado por los cuatro asientos, más tres casos sueltos. El
discriminante es que **el empate y el chombo no dependen del dealer** y el barrido lo comprueba: son
invariantes, no casualidades. Y el caso pedido por el «Hecho cuando» está: con la localía en el Sur, el
mismo tsumo de B pasa de `+1100, −500, −300, −300` a `+1500, −500, −500, −500`.

> **Lo que fallaba de verdad, y era un fallo mío.** El primer barrido del ron asignaba el signo del delta
> por **posición en el array** en lugar de por **identidad**. Con el dealer en Este, Sur u Oeste pasaba por
> casualidad, porque el dealer quedaba primero en orden de asiento; con el dealer en **Norte**, el
> descartador quedaba antes y los signos se intercambiaban. Falló un test de cuatro. No era un fallo del
> motor: era un `it.each` mal escrito, y es justo el que un `expect` escrito a ojo no caza.

**Cobertura.** `npm run test:coverage` mantiene el 100 % de líneas, ramas y funciones sobre
`src/domain/`: 366 sentencias, 246 ramas y 91 funciones, sin huecos. La suite subió de 528 a **547**
pasados, sin los 4 saltados de siempre.

---

## Fase 2 · `domain/replay.ts` — 9 tareas

El corazón de RF-18. Módulo nuevo, así que fichero de test nuevo y umbral de cobertura puesto desde el
primer día (constitution IV.1 e IV.2).

- [x] **T07** Estado inicial de la partida · **Cubre:** RF-18.2 · **Hecho cuando:** `rules.ts` expone el estado inicial con ronda Este, localía Este y honba 0, y `rules.test.ts` lo comprueba.
- [x] **T08** Recorrido hacia delante · **Cubre:** RF-18.7, RF-18.8 · **Hecho cuando:** `replayTurns(players, turnos, desdeTurno)` devuelve los turnos posteriores con ronda, localía, honba, renchan, bote, valor y deltas recalculados, y no muta los que recibe.
- [x] **T09** Recorrido hacia atrás y borrado · **Cubre:** RF-18.10 · **Hecho cuando:** el recorrido desde un turno devuelve exactamente el estado que quedaría si ese turno no se hubiera capturado nunca, y con el turno eliminado de la lista el resultado es el mismo.
- [x] **T10** Validaciones del recorrido · **Cubre:** RF-18.15, RF-18.16, RF-18.17 · **Hecho cuando:** el recorrido vuelve a comprobar resolución, invariante de cuadre y yaku de viento, y **no** vuelve a comprobar chiitoitsu, representabilidad ni presencia de yaku real; el test lo demuestra con un caso en que la ronda cambia y el yaku de viento deja de valer.
- [x] **T11** Marcador y cierre por bancarrota · **Cubre:** RF-18.11, RF-18.12, RF-18.19 · **Hecho cuando:** el recorrido devuelve el marcador de los cuatro y el cierre obligatorio, y hay un caso en que una corrección saca a alguien de negativo y otro en que lo mete.
- [x] **T12** `describe('reproducción')` · **Cubre:** RF-18.7, RNF-1, RNF-3 · **Hecho cuando:** el barrido recorre cada tipo de resultado × localía × renchan × corrección en cada posición, y falla si corregir un turno cambia el resultado respecto a capturar la partida sin corregir.
- [x] **T13** `describe('ida y vuelta')` · **Cubre:** RF-18.7, RNF-1 · **Hecho cuando:** deshacer una corrección devuelve el estado de partida, con los mismos números, en toda la barrida.
- [x] **T14** `describe('mismo input, mismo output')` · **Cubre:** RF-16.5 de 001 por analogía, RNF-1 · **Hecho cuando:** la misma partida con las claves del objeto en distinto orden devuelve turnos profundamente iguales.
- [x] **T15** `describe('conservación de puntos')` y `describe('rechazo entero')` · **Cubre:** RF-18.16 · **Hecho cuando:** tras corregir, la suma de deltas vuelve a la fórmula de `../../docs/domain.md` §5 con chombo y con bote sin reclamar, y una corrección inválida no devuelve ningún turno escrito.

---

## Puerta de dominio 1

- [x] **T16** Cobertura del 100 % en `domain/replay.ts` · **Cubre:** todos los RF de RF-18 · **Hecho cuando:** `npm run test:coverage` informa 100 % de líneas, ramas y funciones (constitution IV.1).

> **✅ Cerrada el 2026-10-14.** 12 ficheros de `domain/` al 100 % de líneas, ramas, funciones y
> sentencias. `replay.ts` entra con 49 tests propios y ninguno quedó sin cubrir.

---

## Fase 2 · Hallazgos y decisiones que abrió esta fase

**`TurnRecord` no guarda `discarderId` ni `chomboId`.** Sin ellos, un ron o un chombo guardado **no se
puede reconstruir**, así que el recorrido no puede consumir el documento tal cual. `replay.ts` define por
eso un tipo de entrada propio, `CapturedTurn`, con solo lo que necesita; el adaptador desde
`TurnRecord` **es trabajo de la fase 4** (`data/turns.repository.ts`), y es donde hay que añadir esos dos
campos. Sin eso, `useGameTurns.correctTurn` no puede llamar al recorrido.

**El invariante de cuadre sí hace trabajo, y no es un adorno.** Con los deltas viniendo de
`resolveTurn` siempre cuadran, así que parecía comprobación muerta. Resulta que **atrapa datos
corruptos**: un turno guardado que referencia a un jugador que no está en la mesa produce deltas
distintas de las declaradas, y el recorrido lo rechaza con `notSquare` en lugar de guardar una mano
imposible. Hay dos tests que lo demuestran.

**`resolveTurn` asume cuatro pagadores.** Una mesa de tres jugadores no cuadra, porque el tsumo reparte
contra tres oponentes fijos. No es un fallo: el juego son cuatro, y el invariante lo detecta.

**El viento de ronda cambia para el turno siguiente, no en el mismo.** Al volver la localía al Este tras
cuatro manos, el viento avanza al Sur **a partir del turno 5**, no en el cuarto. Tres tests se escribieron
con la ocurrencia desplazada y fallaron; el motor tenía razón.

**Borrar un turno no es restar sus deltas.** Los turnos supervivientes pierden también un honba, así que
sus pagos cambian. Es la razón de que el borrado tenga que re-derivar y no restar, y ahora está escrito
como test con los números.

> **Fallos que fueron míos y no del motor**, por si alguien repite el error: asignar el signo de un
> delta por posición en vez de por identidad; suponer que quien gana pasa a ser dealer (el dealer avanza
> por asiento, no por ganador); y una regular que decía `norte` donde el mensaje dice `north`.

---

## Fase 3 · `domain/yaku.ts` — 4 tareas

La parte de dominio con más riesgo de 002: `YAKU_CATALOG` alimenta a la vez la suma de han, la validación
de viento y las estadísticas.

- [ ] **T17** `YakuDefinition.conditions` · **Cubre:** RF-22.2 · **Hecho cuando:** cada yaku del catálogo declara las condiciones en las que cuenta —resultado de la mano, mano cerrada o abierta, riichi declarado, kan, primera o última mano— y `yaku.test.ts` comprueba que `tenhou` y `chiihou` declaran la primera mano.
- [ ] **T18** `sumYakuHan` · **Cubre:** RF-22.1, RF-22.2, RF-22.3, RF-22.4 · **Hecho cuando:** la suma excluye los yaku de límite por `category`, excluye los que no cuentan en ese contexto y devuelve el total, con `yaku.test.ts` para los tres casos.
- [ ] **T19** `describe('yaku situacionales')` · **Cubre:** RF-22.2, RF-22.3 · **Hecho cuando:** cada yaku con condición se prueba en su contexto válido y en tres inválidos, y hay un caso explícito de menzen tsumo por ron que no suma.
- [ ] **T20** Los tres consumidores siguen intactos · **Cubre:** RF-12.4, RF-4.5, RF-16.1 de 001 · **Hecho cuando:** `yaku.test.ts`, `stats.test.ts` y `handValue.test.ts` pasan sin cambiar aserciones, lo que demuestra que el campo nuevo no altera la suma de han, la validación de viento ni las estadísticas.

---

## Puerta de dominio 2

- [ ] **T21** Cobertura del 100 % en todo `src/domain/` · **Cubre:** todos los RF de dominio de 002 · **Hecho cuando:** `npm run test:coverage` informa 100 % de líneas, ramas y funciones sobre `src/domain/`, con `replay.ts` y `yaku.ts` dentro.

---

## Fase 4 · `data/turns.repository.ts` — 6 tareas

- [ ] **T22** Códigos de error nuevos · **Cubre:** RF-19.12, RF-19.14, RF-19.15, RF-21.5 · **Hecho cuando:** `DataErrorCode` incluye `conflict`, `auditFull`, `staleLocal` y `suufonRejected`, `messageOf` los cubre todos y `errors.test.ts` no tiene ninguna rama sin cubrir.
- [ ] **T23** Identificador del turno sin relleno · **Cubre:** RF-20.1, RF-20.2 · **Hecho cuando:** el turno 1 se llama `1` y el 10 se llama `10`, `list` sigue ordenando por el campo numérico `turnNo`, y hay un test que registra 150 turnos y los devuelve en orden.
- [ ] **T24** Escritura del `audit[]` · **Cubre:** RF-19.1, RF-19.2, RF-19.3 · **Hecho cuando:** corregir un turno deja su `capturedBy` intacto, añade `updatedBy`, `updatedAt` y una entrada con el valor anterior de cada campo modificado, y una segunda corrección añade una segunda entrada sin tocar la primera.
- [ ] **T25** Lectura-verificación · **Cubre:** RF-19.12 · **Hecho cuando:** si el registro cambió entre la lectura y la escritura, la escritura se rechaza con `conflict` y no escribe nada, y hay un test que lo demuestra con dos escrituras concurrentes sobre el mismo turno.
- [ ] **T26** `remove` · **Cubre:** RF-18.10 · **Hecho cuando:** borrar el turno 5 de 10 lo elimina y deja los cinco siguientes re-derivados, y borrar el último permite volver a capturar ese mismo número.
- [ ] **T27** Límite del documento · **Cubre:** RF-19.14 · **Hecho cuando:** una corrección cuyo registro superaría el límite de tamaño de documento se rechaza entera con `auditFull`, no escribe ningún turno, y el mensaje nombra el registro que alcanzó su límite.

---

## Fase 5 · `games.repository.ts` y `useGameTurns.ts` — 5 tareas

- [ ] **T28** `turnAudit[]` en el documento de la partida · **Cubre:** RF-19.7 · **Hecho cuando:** borrar el primer turno deja su registro en `games.turnAudit[]` y borrar dos turnos seguidos deja el segundo allí, con un test para cada uno.
- [ ] **T29** `correctTurn` re-deriva · **Cubre:** RF-18.7, RF-18.12, RF-18.14, RF-19.4 · **Hecho cuando:** `correctTurn` persiste el turno corregido, sus re-derivados con su propia entrada de registro y los derivados de la temporada en un único `WriteBatch`, y `useGameTurns.test.ts` lo comprueba contando las escrituras del lote.
- [ ] **T30** `deleteTurn` · **Cubre:** RF-18.9, RF-18.10, RF-18.12 · **Hecho cuando:** `deleteTurn` borra, re-deriva hacia atrás y reescribe los derivados de la temporada en un solo lote, con su entrada de registro en el turno anterior.
- [ ] **T31** `finalsOf` con turnos re-derivados · **Cubre:** RF-18.12 · **Hecho cuando:** el resultado final de una partida corregida sale de los turnos re-derivados y no de los guardados, y `useGames.test.ts` lo distingue de un caso en que los dos difieren.
- [ ] **T32** Estado desfasado · **Cubre:** RF-19.15, RF-19.16 · **Hecho cuando:** si el número de turnos y de correcciones no coincide con el que se leyó al abrir, la corrección se rechaza con `staleLocal` y el borrador y la captura pendiente siguen ahí.

---

## Fase 6 · Interfaz, errores e i18n — 7 tareas

002 **sí toca la interfaz**, porque RF-18.1, RF-21 y RF-23 lo exigen. Lo que va a 003 es lo que ningún RF
de 002 pide.

- [ ] **T33** Claves i18n nuevas · **Cubre:** RF-19.12, RF-19.14, RF-19.15, RF-21.5, RF-23.1 · **Hecho cuando:** existen las claves de los cuatro rechazos nuevos y las de estado de la mano siguiente, `locales.test.ts` pasa y no hay texto literal en ningún componente.
- [ ] **T34** Localía, ronda y honba de solo lectura · **Cubre:** RF-18.1, RF-18.3, RF-18.4, RF-18.5 · **Hecho cuando:** `TurnForm` no ofrece desplegable para la localía, el viento ni el honba, muestra los del turno siguiente derivados, y `TurnForm.test.ts` falla si alguien intenta escribirlos.
- [ ] **T35** Ganadores múltiples · **Cubre:** RF-21.1, RF-21.2, RF-21.3, RF-21.4 · **Hecho cuando:** se admiten de uno a tres ganadores por ron, el descartador no aparece si es ganador y el ganador no aparece si es descartador, y un caso de tres ganadores comprueba que el descartador paga la suma.
- [ ] **T36** Han derivados con desglose y ajuste · **Cubre:** RF-22.5, RF-22.6, RF-22.7, RF-22.8 · **Hecho cuando:** al marcar yaku el total sube solo y se ve el desglose, el ajuste manual se marca como ajuste, y sin ningún yaku real el turno se rechaza aunque el ajuste eleve los han.
- [ ] **T37** Limpieza del formulario · **Cubre:** RF-23.1, RF-23.2, RF-23.3, RF-23.4, RF-23.5 · **Hecho cuando:** tras guardar, tipo de resultado, ganador, descartador, yaku, han, dora, fu, tenpai, chombo y riichi quedan vacíos, el borrador de `localStorage` también, y recargar no restaura lo anterior.
- [ ] **T38** Avisos de la captura · **Cubre:** RF-18.16, RF-19.14, RF-19.15, RF-21.5 · **Hecho cuando:** la pantalla muestra, cada uno con su clave, el turno que invalida una corrección, el registro lleno, el estado desfasado y el suufon renta rechazado.
- [ ] **T39** `GameDetailPage` muestra el estado derivado · **Cubre:** RF-18.16, RF-23.3 · **Hecho cuando:** el detalle de una partida muestra ronda, localía y honba de la mano siguiente sin pedirlos, y `GameDetailPage.test.ts` lo comprueba.

---

## Fase 7 · Fixtures y tests de comportamiento — 6 tareas

La última fase es la que cambia el **tipo** de test de tres requisitos de 001 que hoy se dan por cumplidos.

- [ ] **T40** Las tres fixtures que 001 declaró y nunca creó · **Cubre:** RNF-1 · **Hecho cuando:** existen `tonpuusenSencilla`, `hanchanConTodo` y `partidaConChombo` en `src/__tests__/fixtures/`, y `hanchanConTodo` tiene cuatro declaraciones de riichi, un ron múltiple y un chombo.
- [ ] **T41** Partida completa de extremo a extremo · **Cubre:** RNF-1, RNF-3 · **Hecho cuando:** una partida con reparto de riichi se recorre entera desde la captura hasta el resultado final, y el mismo recorrido con una corrección intercalada da el mismo número final.
- [ ] **T42** **Experimento previo de la red** · **Cubre:** RNF-6 · **Hecho cuando:** hay un documento escrito que dice si se puede cortar la red en `happy-dom` para que el SDK de Firestore encole y sincronice. **Si no se puede, el criterio 26 de la spec se declara fuera de alcance por escrito y no se da por cumplido**, y T43 se marca como descartado con el motivo. Esta tarea no se puede saltar.
- [ ] **T43** `offline.test.ts` · **Cubre:** RNF-4, RNF-5, RNF-6 · **Hecho cuando:** el test corta la red, registra un turno, la restaura y comprueba que llega al servidor. Solo si T42 ha salido bien; si no, esta tarea se marca como descartada con el motivo.
- [ ] **T44** RNF-1 y RNF-3 por comportamiento · **Cubre:** RNF-1, RNF-3, RNF-7 · **Hecho cuando:** hay un test que varía el capturador y el dispositivo y obtiene el mismo resultado, y otro que aplica las reglas de nuevo a una partida corregida y reproduce el ranking.
- [ ] **T45** `firestore.rules` sin cambios · **Cubre:** RF-19.13 · **Hecho cuando:** `firestore.rules.test.ts` sigue en verde sin tocar las reglas, y una nota del repositorio deja constancia de que la inalterabilidad del registro la garantiza el cliente y no las reglas.

---

## Fase 8 · Cierre — 2 tareas

- [ ] **T46** Los cuatro en verde y el 100 % de `domain/` · **Cubre:** todos · **Hecho cuando:** `typecheck && lint && test && format:check` pasan en ese orden, y `test:coverage` mantiene el 100 % de `src/domain/`.
- [ ] **T47** Checklist de salida de `plan.md` §8 · **Cubre:** todos · **Hecho cuando:** las 12 condiciones están comprobadas una a una, incluida la 11 —la fase 0 cerrada antes de la fase 1— y la 12 —el experimento de red con su resultado escrito, sea éxito o no—.

---

## Trazabilidad de RF a tareas

| RF | Tarea |
| --- | ----- |
| RF-18.1 | T04, T05, T06, T34 |
| RF-18.2 a RF-18.6 | T07 |
| RF-18.7, RF-18.8 | T08, T12, T13, T29 |
| RF-18.9 | T30 |
| RF-18.10 | T26, T30 |
| RF-18.11, RF-18.12 | T11, T29, T31 |
| RF-18.13, RF-18.14 | T29 |
| RF-18.15 a RF-18.17 | T10, T15 |
| RF-18.18 | T26 (`assertOpenGame` lo cubre sin código nuevo) |
| RF-18.19 | T11 |
| RF-18.20, RF-18.21 | T08 |
| RF-19.1 a RF-19.3 | T24 |
| RF-19.4 | T29 |
| RF-19.5 | T24 |
| RF-19.6, RF-19.7 | T28 |
| RF-19.8 | T24 |
| RF-19.9 | T24 |
| RF-19.10 | T39 |
| RF-19.11 | T24 — el registro no incluye campo de motivo y ninguno se exige |
| RF-19.12 | T22, T25 |
| RF-19.13 | T45 |
| RF-19.14 | T22, T27, T38 |
| RF-19.15, RF-19.16 | T22, T32, T38 |
| RF-20.1 a RF-20.3 | T23 |
| RF-21.1 a RF-21.4 | T06, T35 |
| RF-21.5 | T22, T38 |
| RF-22.1 a RF-22.4 | T17, T18, T19 |
| RF-22.5 a RF-22.9 | T36 |
| RF-23.1 a RF-23.5 | T33, T37 |
| RNF-1, RNF-3 | T12, T13, T14, T41, T44 |
| RNF-2 | T24, T28 |
| RNF-4 | T43 |
| RNF-5 | T29, T43 |
| RNF-6 | T42, T43 |
| RNF-7 | T44 |
| RNF-8 | T25 |

---

## Notas de mantenimiento

**Grano.** Si una tarea se pasa de 30 minutos, se parte en dos con sufijos: `T08a` y `T08b`. Hay tres
candidatas previsibles: **T08** (el recorrido hacia delante), **T29** (el lote de `correctTurn`) y **T35**
(ganadores múltiples en el formulario).

**La puerta de dominio 1 no es una tarea más.** Cierra la fase 2. Si el 100 % de `replay.ts` no se alcanza
antes de empezar la fase 3, arrastrar el hueco hasta el final es mucho más caro que cerrarlo aquí.

**T42 puede cerrarse sin código.** Es el experimento previo al criterio 26 de la spec, y su resultado
puede ser «no es alcanzable». En ese caso el criterio se declara fuera de alcance por escrito, T43 se
marca como descartado con el motivo, y el plan continúa. Un criterio retirado con motivo es mejor que un
test que se salta sin que nadie lo note, que es lo que pasó con `rules.test.ts` hasta T92 de 001.

**Fase 0 y encargo.** T01, T02 y T03 escriben en `../001/spec.md`, en `../../docs/domain.md` y en
`../../AGENT.md`. Ninguna se puede ejecutar bajo el encargo de redactar 002: constitution I.1 exige
petición explícita para modificar `specs/`, y `AGENT.md` → Rules repite la regla para `specs/`. Al abrir
esta fase hay que dejar escrito quién autorizó cada escritura.

**Al reabrir un hallazgo.** Si una revisión futura de `../../docs/reviews/002-qa.md` reabre algo, se añade
una tarea nueva al final de la fase correspondiente en vez de editar una ya cerrada. Una tarea marcada no
se desmarca.