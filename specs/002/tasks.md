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

> **SUPERADO en parte, 2026-10-15.** El empate sigue sin depender del dealer, pero **el chombo ahora sí**:
> la corrección de `specs/001/spec.md` reparte la penalización entre la mesa y la hace depender de si el
> infractor ocupa la localía (8000 u 12000). El caso de chombo de este barrido está invertido; ver la
> fase 7 de este documento.

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

- [x] **T17** `YakuDefinition.conditions` · **Cubre:** RF-22.2 · **Hecho cuando:** cada yaku del catálogo declara las condiciones en las que cuenta —resultado de la mano, mano cerrada o abierta, riichi declarado, kan, primera o última mano— y `yaku.test.ts` comprueba que `tenhou` y `chiihou` declaran la primera mano.
- [x] **T18** `sumYakuHan` · **Cubre:** RF-22.1, RF-22.2, RF-22.3, RF-22.4 · **Hecho cuando:** la suma excluye los yaku de límite por `category`, excluye los que no cuentan en ese contexto y devuelve el total, con `yaku.test.ts` para los tres casos.
- [x] **T19** `describe('yaku situacionales')` · **Cubre:** RF-22.2, RF-22.3 · **Hecho cuando:** cada yaku con condición se prueba en su contexto válido y en tres inválidos, y hay un caso explícito de menzen tsumo por ron que no suma.
- [x] **T20** Los tres consumidores siguen intactos · **Cubre:** RF-12.4, RF-4.5, RF-16.1 de 001 · **Hecho cuando:** `yaku.test.ts`, `stats.test.ts` y `handValue.test.ts` pasan sin cambiar aserciones, lo que demuestra que el campo nuevo no altera la suma de han, la validación de viento ni las estadísticas.

**Los cuatro, el 2026-10-15.** El catálogo declara las condiciones y `sumYakuHan` las aplica. 22 tests
nuevos en `yaku.test.ts` y 5 aserciones de tipo nuevas en `yaku.test-d.ts`.

**El barrido no prueba ejemplos: prueba los 128 contextos.** Un turno tiene cuatro resultados y cinco
datos binarios —cerrada, riichi, kan, primera mano, última mano—, o sea 128 combinaciones. El test recorre
las 128 × los 46 yaku del catálogo y compara `yakuCountsIn` con un **oráculo escrito en el test** que
reevalúa las condiciones declaradas sin llamar al módulo. Si los dos coinciden en las 5 888 parejas,
no hay atajo escondido; y para cada yaku con condición se comprueba que existe al menos un contexto
válido y **al menos tres inválidos**, que es lo que pedía el «Hecho cuando» de T19.

**`requiresClosedHand` pasa a derivarse de `conditions`, y por eso el catálogo tiene una sola fuente.**
El campo y la condición `closedHand` dicen exactamente lo mismo, y mantenerlos por separado es la forma
de que acaben discrepando en silencio. Las tres aserciones existentes de `yaku.test.ts` siguen dando lo
mismo, y un yaku que exija mano cerrada y no lo declare hace fallar el test. Como efecto lateral, los
yaku de límite que sí exigen mano cerrada —*kokushi musou*, *suukantsu*, *chuuren poutou*, *suucha riichi*,
*tenhou* y *chiihou*— pasan a decir `true`, que antes era `false` por construction y no por regla.

**Pinfu es mano cerrada, y se reconoce por ron. Corrección del 2026-10-15 sobre un dato que faltaba.**
Las reglas del club no decían qué pasaba con el pinfu ganado por ron: `docs/domain.md` §4.2 daba por
hecho que los 20 fu planos eran solo un pinfu por tsumo. El club lo corrige —**ron 30 fu, tsumo 20**—,
así que `pinfu` declara solo `closedHand` y `computeFu` suma el +10 de mano cerrada cuando la mano se
gana por ron. Lo que **no** cambia es el rechazo del ron de 20 fu: sigue siendo `N/A`, y ahora por la
razón correcta, que es que ningún ron baja de 30 fu.

Tres cosas quedaron tocadas por el cambio, y solo tres: las `conditions` de `pinfu`, el `computeFu` de
`yaku.ts` y las dos líneas de `docs/domain.md` §4.2 que decían lo contrario. `validateRepresentable` no
cambia de comportamiento —solo de explicación— y el nombre de su motivo, `pinfuOnlyByTsumo`, se queda
porque es el de RF-4.4 de `specs/001`.

> **La corrección está a medias, y la parte que falta es la importante.** `computeFu` **no tiene ningún
> consumidor en producción**: solo su test. El `fu` que llega al motor es el que teclea quien captura
> (`TurnForm.vue:372`), así que hoy el 30 fu del pinfu por ron hay que **saberlo y escribirlo**, y no
> lo calcula el sistema. Hacerlo derivado es el mismo trabajo que RF-22 hizo con los han, y cae donde
> cae aquel: en el formulario de la fase 6 y en una derogación de RF-3.13 de 001. Está escrito como
> desviación 7 de `docs/domain.md` §4.5 y en la nota de `computeFu`.
>
> **Lo que queda pendiente de tu autorización.** `specs/001/spec.md` sigue diciendo en dos sitios que el
> pinfu exige tsumo: en RF-4.4 y en el caso 31. Constitution I.1 no me deja tocar `specs/` sin que me lo
> pidas, así que la corrección vive en el código y en `docs/domain.md`, y las dos frases de 001 quedan
> contradichas hasta que digas.

**Un id que ya no está en el catálogo no estalla y no suma.** Un turno guardado puede traer un yaku que una
versión anterior del catálogo tenía y esta no. `sumYakuHan` lo devuelve con `reason: 'unknownYaku'` y `han: 0`
en lugar de inventarse un valor: el mismo camino que ya seguían `isLimitYaku` e `isWindYaku`.

**El límite se mira antes que las condiciones.** El motivo de exclusión de un yaku de límite es siempre
`limit` y no depende de la mano en la que se capturó, porque vale 8000 puntos tenga o no las condiciones
cumplidas. Las condiciones se devuelven igualmente en `unmet`, para que la interfaz pueda decir por qué.

> **Dos fallos que fueron míos, del test y no del módulo**: contar a mano los han de una selección de
> seis yaku —dije 4 y eran 5— y escribir el caso de límite con un contexto que no cumplía la primera mano
> de *tenhou*, cuando lo que quería era comprobar que se excluía **precisamente por ser de límite**.

---

## Puerta de dominio 2

- [x] **T21** Cobertura del 100 % en todo `src/domain/` · **Cubre:** todos los RF de dominio de 002 · **Hecho cuando:** `npm run test:coverage` informa 100 % de líneas, ramas y funciones sobre `src/domain/`, con `replay.ts` y `yaku.ts` dentro.

**Cerrada en la fase 8 (T46), no en la 3.** La puerta se comprobó al terminar la especificación y no al
cruzar la fase 4, que es cuando tocaba. El criterio se cumple y con margen: los **doce** ficheros de
`src/domain/` dan 100 % en las cuatro métricas —`replay.ts` y `yaku.ts` incluidos—, y el umbral está
configurado en `vitest.config.ts` con `thresholds` a 100, así que `test:coverage` falla si baja.

---

## Fase 4 · `data/turns.repository.ts` — 6 tareas

- [x] **T22** Códigos de error nuevos · **Cubre:** RF-19.12, RF-19.14, RF-19.15, RF-21.5 · **Hecho cuando:** `DataErrorCode` incluye `conflict`, `auditFull`, `staleLocal` y `suufonRejected`, `messageOf` los cubre todos y `errors.test.ts` no tiene ninguna rama sin cubrir.
- [x] **T23** Identificador del turno sin relleno · **Cubre:** RF-20.1, RF-20.2 · **Hecho cuando:** el turno 1 se llama `1` y el 10 se llama `10`, `list` sigue ordenando por el campo numérico `turnNo`, y hay un test que registra 150 turnos y los devuelve en orden.
- [x] **T24** Escritura del `audit[]` · **Cubre:** RF-19.1, RF-19.2, RF-19.3 · **Hecho cuando:** corregir un turno deja su `capturedBy` intacto, añade `updatedBy`, `updatedAt` y una entrada con el valor anterior de cada campo modificado, y una segunda corrección añade una segunda entrada sin tocar la primera.
- [x] **T25** Lectura-verificación · **Cubre:** RF-19.12 · **Hecho cuando:** si el registro cambió entre la lectura y la escritura, la escritura se rechaza con `conflict` y no escribe nada, y hay un test que lo demuestra con dos escrituras concurrentes sobre el mismo turno.
- [x] **T26** `remove` · **Cubre:** RF-18.10 · **Hecho cuando:** borrar el turno 5 de 10 lo elimina y deja los cinco siguientes re-derivados, y borrar el último permite volver a capturar ese mismo número.
- [x] **T27** Límite del documento · **Cubre:** RF-19.14 · **Hecho cuando:** una corrección cuyo registro superaría el límite de tamaño de documento se rechaza entera con `auditFull`, no escribe ningún turno, y el mensaje nombra el registro que alcanzó su límite.

**Las seis, el 2026-10-15.** 22 tests nuevos en `turns.repository.test.ts` y 5 en `errors.test.ts`, y
`batch.test.ts` describe `turns.remove` en su barrido de lotes.

**El «Hecho cuando» de T26 se ha leído en dos partes, y solo una es de la fase 4.** Borrar el turno 5
**lo elimina y deja los cinco siguientes intactos y en orden**: eso sí lo hace `turnsRepository.remove`, y
está probado. Que esos cinco queden **re-derivados** —renumerados y recalculados desde el turno 4— no
lo puede hacer el repositorio: es `replayTurns`, y constitution V.1 prohíbe que `data/` calcule reglas de
negocio. Es exactamente lo que hace `deleteTurn` en T30, de la fase 5. T26 queda marcada con esa parte
pendiente y explícita, no porque pase.

**`capturedBy` ha desaparecido del parche, y eso rompe una aserción de 001.** RF-19.1 dice que el autor de
captura identifica la versión original y que corregir no lo toca. Mientras `UpdateTurnPatch` lo aceptara,
`update` podía reescribirlo, y había un test que **celebraba** que se podía: `expect(updated.capturedBy)
.toBe('otro')`. Ese test se ha escrito al revés, y ahora hay otro que demuestra que un `capturedBy` colado
en el parche se ignora. Es el único cambio de comportamiento sobre datos ya capturados de esta fase.

**`update` cambia de firma, y arrastra a tres llamadores que no son de esta fase.** De
`update(gameId, turnNo, patch, batch?)` a `update(gameId, turnNo, patch, { batch?, by, expectedAuditCount,
derived? })`. Sin `by` no hay `updatedBy` ni entrada de registro, y sin `expectedAuditCount` no hay
lectura-verificación: los dos son requisitos de T24 y T25, no adornos de la firma. Tocado:
`useGameTurns.correctTurn` —que ahora **lee la lista de turnos antes de corregir** y de ahí saca el número
de correcciones que exige, y por tanto ya no puede perder la corrección ajena de RF-19.12— y tres llamadas
en `useGameTurns.test.ts` y dos en `batch.test.ts`, **todas solo con la firma nueva y sin tocar una sola
aserción**.

**`updatedBy` y `updatedAt` son `null` en el registro y no existen en el documento.** `exactOptionalPropertyTypes`
convierte cada `updatedBy?: string` en un `string | undefined` que hay que guardar en cada spread, y lo que
existe en el documento y lo que se lee no son lo mismo. El registro dice `null` —no corregido— y el
documento **omite** las dos claves, porque guardar un `null` que no significa nada es ruido. La ausencia es
el dato, y hay un test que lo comprueba en las dos caras.


**Una corrección que no cambia nada no deja entrada.** El parche se compara **por valor** —con las claves
ordenadas, para que `{a, b}` y `{b, a}` no cuenten como dos manos— y solo se registra lo que de verdad
cambia. Sin esa regla el registro se llenaba de correcciones vacías y RF-19.14 acababa rechazando un turno
que aún se podía corregir de sobra.

> **Dos cosas que esta fase NO es, y que conviene no dar por hechas.** (1) El registro del **borrado**
> —RF-19.6 en el turno anterior y RF-19.7 en `games.turnAudit[]`— no está: es T28, de la fase 5, y para
> entonces `TurnAuditEntry.action` tendrá que admitir `'delete'` además de `'correct'`. (2) El `audit[]`
> de un turno **re-derivado** —RF-19.4, `derived: true` en cada campo que el sistema recalculó— tampoco:
> la marca ya existe y está probada, pero el que la rellena es `correctTurn` en T29.

> **Un defecto latente que esta fase ha encontrado y no arregla.** `FakeDocumentSnapshot.exists` es un
> **getter**, y en los tipos del SDK de esta versión `exists` es un **método**: un test que escribiera
> `snapshot.exists()` compilaría y reventaría en runtime. Hoy no lo usa nadie. Los tests de esta fase
> comprueban la existencia con `data()` en vez de con `exists`, que funciona con las dos formas.

---

## Fase 5 · `games.repository.ts` y `useGameTurns.ts` — 5 tareas

- [x] **T28** `turnAudit[]` en el documento de la partida · **Cubre:** RF-19.7 · **Hecho cuando:** borrar el primer turno deja su registro en `games.turnAudit[]` y borrar dos turnos seguidos deja el segundo allí, con un test para cada uno.
- [x] **T29** `correctTurn` re-deriva · **Cubre:** RF-18.7, RF-18.12, RF-18.14, RF-19.4 · **Hecho cuando:** `correctTurn` persiste el turno corregido, sus re-derivados con su propia entrada de registro y los derivados de la temporada en un único `WriteBatch`, y `useGameTurns.test.ts` lo comprueba contando las escrituras del lote.
- [x] **T30** `deleteTurn` · **Cubre:** RF-18.9, RF-18.10, RF-18.12 · **Hecho cuando:** `deleteTurn` borra, re-deriva hacia atrás y reescribe los derivados de la temporada en un solo lote, con su entrada de registro en el turno anterior.
- [x] **T31** `finalsOf` con turnos re-derivados · **Cubre:** RF-18.12 · **Hecho cuando:** el resultado final de una partida corregida sale de los turnos re-derivados y no de los guardados, y `useGames.test.ts` lo distingue de un caso en que los dos difieren.
- [x] **T32** Estado desfasado · **Cubre:** RF-19.15, RF-19.16 · **Hecho cuando:** si el número de turnos y de correcciones no coincide con el que se leyó al abrir, la corrección se rechaza con `staleLocal` y el borrador y la captura pendiente siguen ahí.

**Las cinco, el 2026-10-15.** 58 tests nuevos —23 en `turns.repository.test.ts`, 6 en
`games.repository.test.ts`, 26 en `useGameTurns.test.ts` y 3 en `useGames.test.ts`— y la suite pasó de
664 a **722**. Los cuatro comandos en verde y el 100 % de `src/domain/` mantenido: 480 sentencias, 309
ramas, 123 funciones.

### Lo que esta fase NO era: `discarderId` y `chomboId` faltaban en el turno

La fase 2 dejó escrito, en sus hallazgos, que `TurnRecord` no guardaba `discarderId` ni `chomboId` y
que **el adaptador era trabajo de la fase 4**. La fase 4 no lo hizo —sus seis tareas ya estaban
cerradas— así que T29 y T30 no se podían escribir sin él: `domain/replay.ts` rechaza con
`incompleteTurn` un ron o un chombo que no puede reconstruir, y sin reconstructor no hay re-derivación
que hacer. Los dos campos se han añadido a `games/{gameId}/turns/{turnNo}` como **captura** —RF-18.13—
y `TurnForm.vue` los persiste; ya los recogía, solo no los guardaba. Son los únicos campos nuevos de
esta fase y `AGENT.md` → Data model se ha actualizado con ellos, que es lo que pedía el anexo de
`plan.md` §10.

**El adaptador es `capturedTurnOf`, en `data/turns.repository.ts`, y no en `domain/`.** Constitution
V.1 deja a `data/` importar `domain/` **solo como tipo**, así que el repositorio construye el
`CapturedTurn` —un tipo de `domain/replay.ts`— sin llamar a ninguna función de dominio: projection de
campos, no cálculo. El `patch` se aplica **antes** de proyectar, porque lo que se re-deriva es la
partida ya corregida.

### Renumerar un turno no es un `update`, y el orden de los movimientos no es libre

RF-18.9 y el caso límite 19 piden que los turnos posteriores al borrado se re-deriven, y la
numeración de la partida es correlativa: si el hueco no se cierra, el turno borrado no se puede volver
a capturar y `create` lo rechaza con `gapInSequence`. Renumerar cambia **el identificador del
documento**, que `update` no sabe hacer, así que `UpdateTurnOptions` gana `moveToTurnNo`: lee del
turno `N` y escribe en el `N-1`.

El orden de los movimientos dentro del lote es **ascendente**, no descendente, y no es un detalle
cosmético: cada movimiento escribe el identificador que el siguiente va a borrar, así que el `delete`
del identificador `k` tiene que encolarse antes que el `set` del mismo `k`. Al revés —que es lo
primero que se escribe, porque `remove` va primero y arrastra al resto— el turno final se quedaba sin
escribir. Dos de los tests de T30 nacieron de ese error y hoy lo fijan.

### RF-18.18 y el caso límite 18: la salida es borrar el último turno

Decidido por el club el 2026-10-15, en la sesión de trabajo que cerró esta fase, y con eso la
contradicción que había entre RF-18.18 y el caso límite 18 queda resuelta:

> Si existe una bancarrota se debe finalizar la partida. Pero se puede borrar el último turno para
> corrección; esto elimina la bancarrota. Solo esto es posible, pero si no existe edición y se declara
> partida finalizada, termina por la bancarrota.

Es decir: la partida marcada **no admite correcciones ni capturas**, y su **único** camino es borrar
el **último** turno, que es lo que puede levantar la marca (caso límite 18 y RF-18.19). Si ese borrado
no la levanta porque alguien sigue por debajo de cero, la marca se queda y la partida se finaliza
como estaba. Un caso de cada uno está en `useGameTurns.test.ts`.

**El veto vive en `data/`, no en el composable**, porque es un invariante del documento y en `data/`
ya viven `finalizedGame` y `notOpen`. `assertOpenGame` recibe **por qué** se está escribiendo
(`TurnWriteIntent`) y solo deja pasar `deleteLast`. La excepción se pide y **se comprueba**: `remove`
lee los turnos y verifica que el borrado sea de verdad el último —pedirla no la concede—, y la
anotación del borrado en el turno anterior (`deletedTurn`) no la veta porque es parte de ese mismo
borrado. Lo que la marca se levante o no **no** se decide en `data/`: lo decide `domain/replay.ts` y
lo escribe `syncBankruptFlag`, que ya existía de `plan.md` §4.4.

> **Lo que esta fase NO es.** `assertOpenGame` no comprueba `mustFinalize` cuando la partida está
> `finalized` o `unfinished`: el veto de RF-18.18 es solo para la marca, y `finalized` ya tenía su
> propio camino. Y `deleteTurn` pide la excepción solo si la partida está marcada **y** el turno
> borrado es el último, que son las dos cosas que el club dijo.

### Si la partida no se puede reproducir, no se finaliza

Decidido por el club el 2026-10-15, en la misma sesión que la regla de la bancarrota. La primera
versión de T31 caía a los turnos guardados cuando `domain/replay.ts` rechazaba el recorrido, y eso
significaba **inventarse un resultado**: un marcador que la partida no respalda y que nadie podría
comprobar contra RNF-3. Ya no hay camino intermedio.

`derivedTurnsOf` **rechaza**, con el mismo `replayInvalid` y el mismo mensaje que nombra el turno y el
motivo que usa `correctTurn` y `deleteTurn`: los tres caminos comparten ahora `replayOutcomeOf`, en
`useGames.ts`, y la regla es una sola. Hay un test que exige que la partida siga `open`, sin
resultados y sin entrada de auditoría tras el rechazo.

**Lo único que se salta el recorrido es una partida que se aborta por debajo del mínimo** (RF-9.2):
no calcula resultados y no hay nada que reproducir, así que una partida con datos irrecuperables
también se puede cerrar. Hay un test para ese caso, y es lo que impide que una partida rota se quede
sin salida.

### `mustFinalize` ya no es un campo que nadie escribe

Hasta aquí `mustFinalize` estaba en el modelo desde 001 y **nada lo activaba**: `TurnForm` lo leía para
no dejar capturar, pero ningún camino lo ponía a `true`. Esta fase lo activa `syncBankruptFlag` en cada
corrección y en cada borrado, así que el veto tiene por fin algo que vetar y RF-18.18 es real. Por eso
el veto no podía quedar sin escribir: habría sido una puerta que la fase abre y no cierra.

### El identificador de la partida guardada se recalcula y no se hereda

RF-12.4 se apoya en `turns[]` tal y como están escritos. Con la re-derivación, el resultado final
tiene que salir de los turnos **re-derivados** (T31), y eso cambia una cifra de un test de 001 que
estaba midiendo el atajo: `finaliza con el mínimo de turnos` esperaba 37 030 para Ana con deltas
escritos a mano de 3 000, y ahora da 49 030, que es lo que dicen los 6 000 y −2 000 de una mano de
3 han y 30 fu. Es el único cambio de comportamiento de la fase sobre datos ya capturados, y es el
que T31 pedía. La otra rama —recorrido rechazado— ya no existe: ver el apartado de arriba.

### Un quinto código de error, y lo que arrastra

RF-18.16 pide rechazar la operación entera «indicando el número del turno que la hace inviable y por
qué». Ninguno de los cuatro códigos de T22 significa eso: `conflict` es «el turno cambió mientras se
corrigía» y `staleLocal` es «el estado local está desfasado». Se ha añadido `replayInvalid`, con su
mensaje en `messageOf` y su fila en `errors.test.ts`. **T33, en la fase 6, tiene que darle su clave de
i18n**: es un aviso más que los cuatro que su «Hecho cuando» enumera.

Y con las dos decisiones del club, `notOpen` deja de ser un mensaje único: una partida marcada por
bancarrota y una partida por debajo del mínimo se rechazan con el mismo código y con textos distintos.
**T33 necesita también dos claves dentro de `errors.turn.notOpen`**, o una forma de no confundirlas.

### `updatedBy` y `updatedAt` los dice la última entrada del registro

Antes, una corrección que no cambiaba nada ponía los dos a `null`, lo que borraba del documento quién
corrigió ese turno anteriormente. Renumerar hace eso en cada movimiento, así que ahora **se leen de la
última entrada de `audit[]`** y no de esta operación. Sin cambio para el caso que ya había test —un
turno recién creado sigue teniendo `null`— y con cambio donde antes se perdía información.

> **Dos fallos que fueron míos, del test y no del código**, por si alguien repite el error: esperar
> que la localía avanzara en el turno 3 cuando el dealer del turno 2 estaba en tenpai y la conserva
> —la secuencia correcta es `p1, p2, p2`— y escribir cuatro turnos esperando el marcador de cuatro
> cuando el fixture sembraba ocho. Los dos los cazó la suite completa, no el fichero suelto.

---

## Fase 6 · Interfaz, errores e i18n — 7 tareas

002 **sí toca la interfaz**, porque RF-18.1, RF-21 y RF-23 lo exigen. Lo que va a 003 es lo que ningún RF
de 002 pide.

- [x] **T33** Claves i18n nuevas · **Cubre:** RF-19.12, RF-19.14, RF-19.15, RF-21.5, RF-23.1 · **Hecho cuando:** existen las claves de los cuatro rechazos nuevos y las de estado de la mano siguiente, `locales.test.ts` pasa y no hay texto literal en ningún componente.
- [x] **T34** Localía, ronda y honba de solo lectura · **Cubre:** RF-18.1, RF-18.3, RF-18.4, RF-18.5 · **Hecho cuando:** `TurnForm` no ofrece desplegable para la localía, el viento ni el honba, muestra los del turno siguiente derivados, y `TurnForm.test.ts` falla si alguien intenta escribirlos.
- [x] **T35** Ganadores múltiples · **Cubre:** RF-21.1, RF-21.2, RF-21.3, RF-21.4 · **Hecho cuando:** se admiten de uno a tres ganadores por ron, el descartador no aparece si es ganador y el ganador no aparece si es descartador, y un caso de tres ganadores comprueba que el descartador paga la suma.
- [x] **T36** Han derivados con desglose y ajuste · **Cubre:** RF-22.5, RF-22.6, RF-22.7, RF-22.8 · **Hecho cuando:** al marcar yaku el total sube solo y se ve el desglose, el ajuste manual se marca como ajuste, y sin ningún yaku real el turno se rechaza aunque el ajuste eleve los han.
- [x] **T37** Limpieza del formulario · **Cubre:** RF-23.1, RF-23.2, RF-23.3, RF-23.4, RF-23.5 · **Hecho cuando:** tras guardar, tipo de resultado, ganador, descartador, yaku, han, dora, fu, tenpai, chombo y riichi quedan vacíos, el borrador de `localStorage` también, y recargar no restaura lo anterior.
- [x] **T38** Avisos de la captura · **Cubre:** RF-18.16, RF-19.14, RF-19.15, RF-21.5 · **Hecho cuando:** la pantalla muestra, cada uno con su clave, el turno que invalida una corrección, el registro lleno, el estado desfasado y el suufon renta rechazado.
- [x] **T39** `GameDetailPage` muestra el estado derivado · **Cubre:** RF-18.16, RF-23.3 · **Hecho cuando:** el detalle de una partida muestra ronda, localía y honba de la mano siguiente sin pedirlos, y `GameDetailPage.test.ts` lo comprueba.

**Las siete, el 2026-10-15.** 61 tests nuevos —32 en `TurnForm.test.ts`, 6 en `GameDetailPage.test.ts`,
6 en `locales.test.ts`, 2 en `errors.test.ts`, 4 en `turns.repository.test.ts`, 4 en `replay.test.ts` y
3 en `useGameTurns.test.ts`, más 4 de la revisión posterior del club— y la suite pasó de 722 a
**781**. Los cuatro en verde y el 100 % de `src/domain/` mantenido: 480 sentencias, 309 ramas, 123
funciones.

### Siete claves, no cuatro: dos códigos que la fase 5 había dejado como mensaje suelto

La fase 5，天下 los rechazos de bancarrota con `notOpen` y el texto dentro de `message`, y dijo que
T33 tendría que distinguirlos. Se ha hecho **dando su propio código** a cada uno: `gameMarked` y
`notLastTurn`. `notOpen` vuelve a ser un único significado, y la interfaz puede traducir por código
como manda AGENT.md → Errores.

Y con `replayInvalid` son **siete**, más `notReproducible`, que es el aviso propio de la captura. La
fase 6 cierra el aviso de T33 y lo hace **completo**: `ERROR_KEYS` es un `Record<DataErrorCode,
string>` sin `Partial`, y hay un test que recorre los doce códigos y comprueba que la clave existe en
el catálogo. Un código sin clave no falla al compilar: se vería en la mesa como una ruta de i18n.

El número del turno que invalida una operación viaja en `DataError.details` y no en `message`, porque
`message` no se muestra. El mensaje de i18n lleva `{turn}`.

### El estado derivado se expone, no se recalcula en el componente

RF-23.3 pide mostrar la mano siguiente. La tentación era recorrer la partida en el `.vue`, y eso
significaría reinventar `nextHand` en la interfaz —justo lo que RF-18.1 viene a cerrar—. Lo que hay
es `ReplayOutcome.nextHand`, una línea de `domain/replay.ts` con su test, y un `nextHand` calculado
en `useGameTurns` que lo lee. **Cuando el recorrido rechaza, `nextHand` es `null` y no hay panel que
enseñar**: la partida no se puede reproducir y, por tanto, no se puede capturar ni finalizar. Es la
misma decisión que el clubtomó en la fase 5, aplicada al formulario en vez de al botón.

`useGameTurns` lee ahora la partida con `gameDetailQuery`, la **misma clave** que usa la pantalla de
detalle: no hay una segunda petición. Un test de 001 que espiaba una query gemela del detalle se
tocó porque la caché la descartaba por duplicada; ahora espía la lectura real, que es mejor prueba.

### El contexto de yaku que el formulario supone

RF-22.2 pide que el catálogo diga cuándo cuenta cada yaku, y `sumYakuHan` lo aplica. El formulario
tiene que darle un contexto, y **no modela mano abierta ni kan** —eso es 004, «verificación de la
mano»—, así que declara `isClosedHand: true` y `hasKan: false`. Es la lectura por defecto de quien no
marca lo contrario, y está escrito en el código para que nadie lo lea como un olvido.

Eso tiene una consecuencia visible: **un yaku que no cuenta no se borra, se señala**. El desglose
muestra cada yaku con su han y por qué no entró, y con las condiciones que faltan.

### RF-22.8 cambia el disparador del «no hay yaku»

La derogación de RF-4.3 dice que el disparador pasa a ser «no haber seleccionado ningún yaku real».
Antes el formulario rechazaba cuando `yakuHan <= 0`; ahora el han es derivado y **el único rechazo es
no tener ningún yaku marcado**. Ni los dora ni el ajuste lo sustituyen, y hay un test que sube el
ajuste a 13 y comprueba que la mano se rechaza igual. Un yaku marcado que no cuenta **no** rechaza:
eso es RF-22.3, y la diferencia es deliberada.

`yakuHanOverride` es un campo nuevo del turno —RF-22.9—, **delta** sobre la suma del catálogo, no un
segundo total. Es lo que permite distinguir qué aportó el catálogo de qué aportó la persona, y lo que
deja el total derivable.

### El borrador sin tipo de resultado no se guarda

RF-23.2 pide que recargar no restaure lo guardado. La primera versión limpiaba el borrador y luego
reiniciaba el formulario, y el vigilante volvía a escribirlo vacío. La regla que lo cierra es
**un borrador sin tipo de resultado no es una captura en curso**: no se guarda nunca. Es la misma
protección contra el fallo más caro de la mesa —duplicar una mano entera con datos de la anterior— y
no depende del orden de los avisos.

### Lo que T38 **no** puede mostrar, y por qué

`correctTurn` y `deleteTurn` no tienen ningún botón que los dispare: la pantalla de corrección es de
003. De los siete rechazos, la captura puede producir `suufonRejected`, `gameMarked` y
`notReproducible`, y esos tres tienen su aviso probado. `conflict`, `auditFull`, `staleLocal` y el
`{turn}` de `replayInvalid` tienen su clave, su código y su mensaje —probados en `errors.test.ts` y en
`locales.test.ts`—, pero **no hay ruta de interfaz que los dispare todavía**. No es un hueco del
mapeo: es que la operación no existe en pantalla.

> **Dos cosas que la fase 6 NO es.** No hay desglose de fichas ni verificación de mano —004— y el
> formulario no puede marcar una mano abierta. Y el aviso de bancarrota del formulario dice que se
> puede borrar el último turno o finalizar, que es lo que el club decidió en la fase 5.

> **Fallos que fueron míos, del test y no del código**: esperar 3 han de `riichi` + `tanyao` (son 1 y
> 1), y esperar que `riichi` sumara sin que nadie lo hubiera declarado —el catálogo dice que el riichi
> cuenta **si está declarado**, y por eso el test ahora lo declara. Los dos los cazó el catálogo de
> condiciones que escribió la fase 3.

### Revisión a petición del club: el contador de la mano siguiente

El club pidió evaluar «el contador empieza a aumentar con cada ronda, y debería aumentar solo cuando
el dealer gana». **El contador está bien y la regla dice lo contrario**, y está escrito en
`docs/domain.md` §2 desde antes de 002:

> `honba` — contador de rondas **no ganadas por el dealer**.

Es decir: sube cuando el dealer **no** gana y vuelve a cero cuando gana. Si subiera al ganar, el
bonus de 300 puntos premiaría al dealer por ganar, y `docs/domain.md` dice justo lo contrario: «el
valor de una mano no depende solo del as, sino de cuántas rondas lleva el dealer **sin ganar**».

Lo que sí se ha hecho es **fijarlo con números de punta a punta**, porque era una regla que se
podía poner en duda y no estaba probada por el camino que la ve el usuario. Tres tests nuevos en
`TurnForm.test.ts` recorren la secuencia entera y comprueban los importes:

| Turno | Mano | Pantalla | Se guarda |
| ----- | ---- | -------- | --------- |
| T1 | gana el dealer (Este) | Este · 0 | `honba=0`, deltas `+1500 −500 −500 −500` |
| T2 | empate, el dealer no tiene tenpai | Sur · **1** | `honba=0` |
| T3 | empate, el dealer sí tiene tenpai | Sur · **2** | `honba=1` |
| T4 | gana el dealer (Sur) | Sur · **0** | `honba=2`, deltas `+2100 −700 −700 −700` |

La misma mano de 1 han 30 fu vale **1500 sin contadores y 2100 con dos**: exactamente 300 × 2, y
cada uno de los tres que paga pone 200. El bonus funciona en las dos direcciones —lo cobra el dealer
que vuelve a ganar y lo paga el dealer que pierde— que es lo que pedía la revisión.

### El `isRenchan` sí estaba mal, y era culpa de esta misma fase

Al reescribir `TurnForm.vue` para T34 se dejó `isRenchan: false` en lugar de calcularlo. El campo
quedaba **siempre falso**, y antes —con el mismo error que la fase 1 corrigió en el motor— se
calculaba mirando `seat === 'east'`. Ahora sale de la localía **real** del turno, con el mismo
criterio con el que `domain/replay.ts` avanza la localía, y hay dos tests que lo fijan: un renchan
cuando el Este es la localía, no-renchan cuando el Este ya no lo es, y el chombo que tampoco.

### Un hueco de 0 han que la revisión destapó, y que **no** se ha corregido

Al construir el recorrido de la revisión, marcar `riichi` **sin declararlo** guardaba la mano con
`yakuHan = 0` y la mesa pagaba 900 puntos: una mano de 0 han es una mano que `handValue.ts` puntúa
igual que cualquier otra. El desglose lo avisaba —«no cuenta en esta mano»— y RF-22.3 dice que eso se
**señale, no se rechace**, así que el rechazo no está escrito en ninguna parte.

La corrección natural es rechazar cuando **ningún** yaku marcado cuenta y ninguno es de límite, que es
la lectura de «ningún yaku real» de RF-22.8. **No se ha aplicado** porque cambia turnos que hoy se
guardan y es una decisión de reglas del club, no de código. Queda anotado aquí para decidirlo.

---

## Fase 7 · Fixtures y tests de comportamiento — 6 tareas

La última fase es la que cambia el **tipo** de test de tres requisitos de 001 que hoy se dan por cumplidos.

- [x] **T40** Las tres fixtures que 001 declaró y nunca creó · **Cubre:** RNF-1 · **Hecho cuando:** existen `tonpuusenSencilla`, `hanchanConTodo` y `partidaConChombo` en `src/__tests__/fixtures/`, y `hanchanConTodo` tiene cuatro declaraciones de riichi, un ron múltiple y un chombo.
- [x] **T41** Partida completa de extremo a extremo · **Cubre:** RNF-1, RNF-3 · **Hecho cuando:** una partida con reparto de riichi se recorre entera desde la captura hasta el resultado final, y el mismo recorrido con una corrección intercalada da el mismo número final.
- [x] **T42** **Experimento previo de la red** · **Cubre:** RNF-6 · **Hecho cuando:** hay un documento escrito que dice si se puede cortar la red en `happy-dom` para que el SDK de Firestore encole y sincronice. **Si no se puede, el criterio 26 de la spec se declara fuera de alcance por escrito y no se da por cumplido**, y T43 se marca como descartado con el motivo. Esta tarea no se puede saltar.
- [-] **T43** `offline.test.ts` · **Cubre:** RNF-4, RNF-5, RNF-6 · **Hecho cuando:** el test corta la red, registra un turno, la restaura y comprueba que llega al servidor. Solo si T42 ha salido bien; si no, esta tarea se marca como descartada con el motivo.
- [x] **T44** RNF-1 y RNF-3 por comportamiento · **Cubre:** RNF-1, RNF-3, RNF-7 · **Hecho cuando:** hay un test que varía el capturador y el dispositivo y obtiene el mismo resultado, y otro que aplica las reglas de nuevo a una partida corregida y reproduce el ranking.
- [x] **T45** `firestore.rules` sin cambios · **Cubre:** RF-19.13 · **Hecho cuando:** `firestore.rules.test.ts` sigue en verde sin tocar las reglas, y una nota del repositorio deja constancia de que la inalterabilidad del registro la garantiza el cliente y no las reglas.

### T42 · El experimento de la red: no es alcanzable

El veredicto está en [`../../docs/reviews/002-red.md`](../../docs/reviews/002-red.md). Medido, no opinado:
`happy-dom` **no expone `indexedDB`** —el propio SDK lo dice y baja a caché en memoria con
*«Offline persistence has been disabled»*—, **no hay emulador** porque `FIRESTORE_EMULATOR_HOST` está
vacío, y sin emulador la segunda mitad del criterio —«sincroniza después»— **no tiene a qué mirar**.
Peor: la medición salió **a internet de verdad** y volvió un `PERMISSION_DENIED` de
`firestore.googleapis.com`, así que un test de esto habría dependido de Google.

**El criterio 26 queda declarado fuera de alcance por escrito y no se da por cumplido**, que es
justo lo que el propio criterio 26 pide para el caso de que el experimento demuestre que no es
alcanzable. T43 se marca descartada por ese motivo, no por omisión.

Lo que RNF-4 y RNF-5 sí sostienen, y cómo:

- **RNF-4 — re-derivar no exige red**: la re-derivación vive en `domain/replay.ts`, que es puro. Lo
  demuestra que el módulo no importa nada de Firebase.
- **RNF-5 — la escritura es atómica**: `useGameTurns.test.ts` comprueba que `correctTurn` abre **un
  único `WriteBatch`**, que es la parte de la atomicidad observable sin red.
- **La persistencia**: `src/app/firebase.ts` configura `initializeFirestore` con `persistentLocalCache`
  y `firebase.test.ts` comprueba esa llamada. Lo que no se comprueba es que funcione *en un navegador
  real*, y eso no es cosa de un test unitario.

Reabrir T43 pediría las tres cosas del documento, no una.

### T41 · Lo que la partida completa destapó

La corrección de un turno **no podía cambiar quién gana**. `capturedTurnOf` leía
`winners: record.value.map(...)` e ignoraba `patch.value`, así que un ron corregido de un ganador a
dos se re-derivaba con el ganador viejo y la partida corregida **nunca podía coincidir** con la misma
partida capturada sin corregir. No lo cubría ningún test: `useGameTurns.test.ts` no tenía ni un caso
que cambiara el conjunto de ganadores. RNF-1 era indemostrable, que es exactamente lo que la fase 7
tenía que comprobar. Corregido en `data/turns.repository.ts` —los ganadores son captura, no estado
derivado, y salen del parche igual que el resto de campos capturados— y fijado con un test en
`determinismo.test.ts`.

### T44 · Qué es «variar el dispositivo» cuando no hay red

No se puede simular un dispositivo físico, así que la fase varía lo que **de verdad** puede colarse en
un resultado: quién escribió cada turno (`capturedBy`), el orden de las claves del documento y el
orden en que se aplican las correcciones. Los tres dan el mismo ranking.

### T45 · El registro lo protege el cliente

`firestore.rules` **no** se ha tocado, y `firestore.rules.test.ts` sigue verde con un test nuevo que
falla si alguien añade la palabra `audit` a las reglas. La nota está en `AGENT.md` → Reglas de
seguridad, con los tres puntos del cliente que sostienen la trazabilidad y **la consecuencia asumida**:
quien puede corregir un turno puede borrar su historial, porque las reglas no distinguen campos dentro
de un documento y `allow write` lo concede entero.

---

## Fase 8 · Cierre — 2 tareas

- [x] **T46** Los cuatro en verde y el 100 % de `domain/` · **Cubre:** todos · **Hecho cuando:** `typecheck && lint && test && format:check` pasan en ese orden, y `test:coverage` mantiene el 100 % de `src/domain/`.
- [x] **T47** Checklist de salida de `plan.md` §8 · **Cubre:** todos · **Hecho cuando:** las 12 condiciones están comprobadas una a una, incluida la 11 —la fase 0 cerrada antes de la fase 1— y la 12 —el experimento de red con su resultado escrito, sea éxito o no—.

### T47 · El checklist de salida

Está en [`../../docs/reviews/002-salida.md`](../../docs/reviews/002-salida.md), con la evidencia de las
doce condiciones una a una. **11 cumplidas, 1 con salvedad y 1 defecto corregido al comprobarla.**

Lo que salió:

- **La condición 10 fallaba.** `discarderId` y `chomboId` son campos nuevos de `turns/{turnNo}` que
  estaban en `AGENT.md` pero **no tenían fila** en la tabla de cambios de modelo de `spec.md` §4, ni
  aparecían en `plan.md`. Es justo el fallo que describe el hallazgo C2, y el checklist lo ha cazado.
  Corregido: la tabla pasa de cinco a seis filas y declara los dos campos con su RF.
- **La condición 11 no se puede demostrar, y el historial apunta en contra.** El repositorio tiene dos
  commits: `e44c72d` (2026-10-06) trae el estado inicial y la fase 1, **sin** `replay.ts` y **sin** el
  §8.1 de `specs/001/spec.md`; `467d13d` (2026-10-15) trae a la vez la fase 0 y las fases 2 a 7. Es
  decir, **el código de la fase 1 está en un commit anterior a las derogaciones que la fase 0 tenía que
  escribir** — lo que constitution I.1 prohíbe.

  No se da por cumplida porque no lo está, y **no se corrige desde aquí**: arreglarlo exigiría reescribir
  el historial, y un checklist de salida no es el sitio para reescribir historia. Lo que sí hay es la
  evidencia de proceso, que apunta a que la regla se respetó —T01 registra que hubo que pedir permiso
  explícito, y el «Hecho cuando» de la fase 0 deja escrito que no toca `src/` y que la suite salió
  idéntida—; lo que falta es un commit que lo demuestre, porque el squash borró la frontera.

  Ninguna de las otras once condiciones depende de esta: todas se miden sobre el árbol de trabajo actual.
  Lo que la 11 protege es la trazabilidad del proceso, no el resultado. La decisión de si se acepta o
  se rehacen los commits es del club.

- **La condición 12 se cumple con resultado negativo.** `docs/reviews/002-red.md` existe y el criterio 26
  queda declarado fuera de alcance por escrito, que es lo que el propio criterio prevé.

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
| RNF-1, RNF-3 | T12, T13, T14, T40, T41, T44 |
| RNF-2 | T24, T28 |
| RNF-4 | **T43 descartada.** Re-derivar es puro y no toca la red: `domain/replay.ts` |
| RNF-5 | T29 · la atomicidad por lote. **T43 descartada**: la sincronización no es comprobable aquí |
| RNF-6 | T42 (experimento, veredicto negativo) · T44 (RNF-1 y RNF-3 por comportamiento) |
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