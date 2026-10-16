# spec.md — 002 · El turno como unidad verificable

**Estado:** requisitos cerrados, lista para la revisión de calidad
**Alcance:** corrección de la captura de turnos y de su trazabilidad
**Continuación de:** [`../001/spec.md`](../001/spec.md), que se da por cerrada
**Reglas de puntuación:** [`../../docs/domain.md`](../../docs/domain.md)
**Revisión de calidad:** [`../../docs/reviews/002-qa.md`](../../docs/reviews/002-qa.md)

---

## 0. Relación con `specs/001`

Esta especificación **complementa** a 001: no la reemplaza ni la reescribe. Todo requisito de 001 sigue
vigente salvo los que aparecen en la tabla de **Derogaciones** de §4, y los cambios de modelo que 001
describe en `AGENT.md` siguen vigentes salvo los declarados aquí.

Las dudas de §9 continúan la numeración de 001 §9, que terminó en la 27. La revisión que motivó esta
escritura está en [`../../docs/reviews/002-qa.md`](../../docs/reviews/002-qa.md), con 25 hallazgos.

---

## 1. Contexto y objetivo

### Contexto

La especificación 001 construyó el registro de partidas y el motor de cálculo, y sus 106 tareas están
cerradas. Al usar la aplicación en la mesa, y al auditar sus requisitos uno a uno contra el código,
aparecieron cinco cosas. **Ninguna es una idea nueva: son compromisos de 001 que el código no
cumple.** El plan técnico de 001 ya lo avisaba en §6.3 y §7: la columna de trazabilidad es una
«declaración de intención, no una verificación», y hay requisitos que se cumplen solo en `domain/` y no
en la aplicación.

1. **La localía, el viento de ronda y el honba se teclean a mano en cada turno.**
   `domain/rules.ts` define `nextHand()`, que los calcula, y el único código que lo referencia es su
   propio test. En la pantalla de captura son tres desplegables con valores por defecto. Cada turno
   depende de que alguien escriba bien el honba, y un honba equivocado cambia los pagos en silencio.
   RF-3.13 promete lo contrario.

2. **Corregir un turno no vuelve a calcular los turnos siguientes.** El resultado final de una partida
   se obtiene sumando los deltas ya guardados, así que una corrección que cambia el bote, el ganador o
   el tipo de resultado deja el resto de la partida desfasado y su suma puede dejar de cuadrar. RF-9.6
   promete recalcular el resultado.

3. **Una corrección no deja rastro.** El turno se sobrescribe conservando su autor y su fecha de
   creación. Nada registra quién corrigió, cuándo ni qué había antes: el documento acaba atribuyendo a
   alguien un valor que no escribió, y RNF-2 dice que cada turno debe ser rastreable hasta el usuario
   que lo capturó.

4. **El han de yaku se teclea aparte de los yaku.** El catálogo declara el han de cada yaku y
   `computeHandValue` suma `yakuHan + doraCount`, sin mirar nunca qué yaku se marcó. Se puede marcar
   `riichi` y escribir 5 han, y el sistema lo acepta sin decir nada.

5. **El catálogo no sabe cuándo cuenta un yaku.** `YAKUDefinition` declara `han`, `category`,
   `requiresClosedHand` y `statKey`, y no tiene ningún campo que diga *cuándo* cuenta. Ippatsu suma un
   han a la carta aunque solo cuente bajo riichi; menzen tsumo lo suma aunque la mano sea un ron;
   rinshan y chankan dependen de que haya habido kan; haitei y houtei dependen de ser la última mano.
   Mientras eso no se modele, cualquier suma automática de han propone un número que sabe que está mal.

A esto se suman tres huecos que no son incumplimientos sino trabajo declarado: no se puede capturar un
**ron múltiple** desde la interfaz (RF-6.1 lo exige y el motor lo resuelve), no existe **ningún test que
compruebe RNF-1, RNF-3 o RNF-5 por comportamiento**, y no se ha resuelto el **doble conflicto de
escritura** sobre un turno corregido.

### Objetivo

Que el resultado de una partida no dependa del orden en que se corrigió, y que el sistema no le pida a
quien está en la mesa que escriba lo que ya sabe calcular. Concretamente:

- **Lo derivado, lo deriva el sistema.** Localía, viento de ronda, honba y han de yaku salen de los
  turnos anteriores y del catálogo, no del teclado.
- **Una corrección llega hasta el final.** Corregir o borrar un turno vuelve a calcular todos los
  turnos que dependen de él, en la misma operación y de forma atómica.
- **Corregir no borra el pasado.** Cada corrección conserva quién la hizo, cuándo y el valor anterior
  de cada campo modificado.

### Por qué se decide así

- **Se re-deriva en lugar de prohibir la corrección.** La alternativa era prohibir corregir cualquier
  turno que tuviera sucesores, o no re-derivar y recalcular solo el marcador final. Prohibirlo
  convertiría cualquier error de captura antiguo en un muro; recalcular solo el marcador dejaría mal el
  bote que RF-5.6 promete consultar «en cualquier momento».
- **El han derivado es editable y no bloqueado.** La alternativa era derivarlo del todo. La razón por la
  que se elige el ajuste manual es que modelar «cuándo cuenta» cada yaku situacional es trabajo de
  dominio real (hallazgo A4 de la revisión), y mientras no esté, el campo de ajuste es lo que evita que
  la suma automática produzca una mano imposible sin que nadie lo note.
- **La auditoría es un array dentro del turno, no una subcolección.** Replica `finalizationAudit[]` de
  `games`, evita una regla nueva de seguridad y evita el grupo de colección que ya costó tres arreglos
  seguidos en T105, T106 y T107.

---

## 2. Usuarios

No hay novedad en este documento: los tres usuarios de 001 §2 se mantienen tal cual —visitante, usuario
con cuenta y jugador invitado— y **no hay niveles de permiso**. La autenticación sigue siendo correo y
contraseña por Firebase Authentication (RF-15.9 de 001) y la gestión de cuentas sigue fuera del
sistema.

Lo único que cambia es qué puede ver un visitante: además de quién capturó cada turno, **quién lo
corrigió y qué valor tenía antes**. Es la misma lógica de RF-14.4 aplicada a la corrección.

---

## 3. Historias de usuario

**HU-10.** Como *usuario con cuenta*, quiero *que la localía, el viento de ronda y los contadores los
ponga el sistema* para que *no tenga que calcularlos en la mesa con la partida en curso*.

**HU-11.** Como *usuario con cuenta*, quiero *corregir un turno y que todo lo que va después se vuelva a
calcular* para que *un error de captura no deje un resultado que no cuadra*.

**HU-12.** Como *usuario con cuenta*, quiero *borrar un turno y recapturarlo* para que *pueda rehacer
una mano entera sin dejar el resto de la partida desfasado*.

**HU-13.** Como *usuario con cuenta*, quiero *saber quién corrigió cada turno y qué había antes* para que
*la corrección no borre el rastro del club*.

**HU-14.** Como *usuario con cuenta*, quiero *que los han se calculen al elegir los yaku* para que *no
escriba un número que contradiga lo que acabo de marcar*.

**HU-15.** Como *usuario con cuenta*, quiero *registrar un ron doble o triple* para que *una mano de tres
ganadores no quede guardada como una de uno solo*.

**HU-16.** Como *visitante*, quiero *que las cifras de una partida corregida sean las mismas que si no se
hubiera corregido* para que *pueda fiarme de las estadísticas del club*.

---

## 4. Requisitos funcionales

Cada criterio de aceptación está expresado en notación EARS: *Cuando …*, *Si …*, *Mientras …*, *Si no
…* o *El sistema …*.

### Derogaciones de `specs/001`

Esta especificación **complementa** a 001 (ver §0) y cambia el texto de tres de sus requisitos. Se
declaran aquí para que quien herede ambos documentos no tome por bueno un código que incumple 001.

| RF de 001 | Qué dice hoy | Qué pasa | Naturaleza |
| --------- | ------------ | -------- | --------- |
| **RF-3.13** | Un turno con resultado de mano «debe exigir los yaku, el número de han de yaku, el número de dora, el fu y el contador de honba, así como el asiento de la localía» | El han de yaku, el honba y la localía **pasan a calcularlos el sistema** y se muestran. El capturador ya no los escribe | **Derogación** de la exigencia de entrada; RF-18.1 y RF-22 |
| **RF-4.3** | «Si un turno se registra con `yakuHan` en cero, el sistema debe rechazarlo» | El disparador pasa a ser **no haber seleccionado ningún yaku real**, aunque el ajuste manual compense | **Derogación** del disparador; RF-22.6 |
| **RF-3.9** | Corregir «debe volver a calcular el marcador y las estadísticas con el turno corregido» | Se **amplía**: además del marcador, se re-derivan los turnos posteriores | **Ampliación**; RF-18.7 |
| **RF-6.1** | «Debe permitir registrar que en un mismo turno ganan dos o tres jugadores por ron» | **Se cumple.** El motor ya lo resolvía; la interfaz no lo alcanzaba | **Cumplimiento**; RF-21 |
| **RF-6.5** | «Si *ganan los cuatro jugadores en el mismo turno por tsumo* (`suufon renta`), el sistema debe registrar un tsumo normal con cuatro ganadores» | **Derogado por decisión del club.** El suufon renta queda vetado y la captura de cuatro ganadores por tsumo se rechaza. Ver RF-21.5 | **Derogación**; RF-21.5 |
| **RF-0.4**, **RF-10.6** | Con cierre obligatorio por bancarrota «debe permitir únicamente la acción de finalizar, además del registro de auditorías» | **Se mantiene entero.** 002 no abre esa puerta: una partida marcada no admite correcciones ni borrados | **Sin cambio**; RF-18.18 |
| **RF-9.2** | Finalizar por debajo del mínimo pasa la partida a `abortada` | **Sin cambio.** El texto del botón es una decisión de interfaz y pertenece a `003` | **Sin cambio** |

La derogación del suufon renta alcanza también a `docs/domain.md` §2, *Fin de mano*, que reconoce los
cuatro ganadores por tsumo. **No alcanza a `tenhou` ni a `chiihou`**: un dealer puede completar su mano
en la primera Lama sin que la completen los otros tres, así que los dos yaku de límite siguen siendo
capturables. Lo que deja de existir es únicamente el caso **simultáneo**.

Además, 002 altera seis reglas del modelo de datos. Las cinco primeras están en `AGENT.md` → Data model
y la sexta en `docs/domain.md`; todas se declaran aquí:

| Documento | Qué dice hoy | Qué pasa |
| --------- | ------------ | -------- |
| **`AGENT.md` → Data model, `turns/{turnNo}`** | «ID como string con relleno a dos dígitos, para que el orden lexicográfico sea el cronológico» | El identificador pasa a ser el número del turno **sin relleno**, y el orden lo fija el campo numérico; RF-20 |
| **`AGENT.md` → Data model, `turns/{turnNo}`** | La lista de campos termina en `capturedBy`, `isRenchan`, `isFinalTurn` y `createdAt` | Se añaden **`updatedBy`**, **`updatedAt`** y **`audit[]`**; RF-19.2, RF-19.3 y RF-19.4 |
| **`AGENT.md` → Data model, `turns/{turnNo}`** | El turno guarda `yakuHan` como dato de entrada | `yakuHan` pasa a ser **derivado** y el ajuste a mano se guarda aparte; RF-22.9 |
| **`AGENT.md` → Data model, `turns/{turnNo}`** | La lista de campos no tiene **`discarderId`** ni **`chomboId`** | Se añaden los dos como **captura**, a `null` cuando el turno no es de ese tipo. Sin ellos un ron o un chombo guardado no se puede volver a resolver, porque el recorrido los necesita para reconstruir la mano; RF-18.13 |
| **`AGENT.md` → Data model, `games/{gameId}`** | La lista de campos incluye `finalizationAudit[]` | Se añade **`turnAudit[]`**, que solo recibe el registro de borrados sin turno anterior; RF-19.7 |
| **`AGENT.md` → Data model, `games.finalizationAudit[]`** | «`{ at, by, action, reason? }`» | **No cambia.** El registro de correcciones de los turnos es otro documento con otra forma, y ambos conviven sin mezclarse; RF-19 |

Cada fila se desglosa con su alternativa descartada en `specs/002/plan.md`, y las tres derogaciones de
texto se escriben además en `specs/001/spec.md` antes de implementar, porque `AGENT.md` → Rules y
constitution I.1 obligan a que la spec declare antes de codificar y a pedir permiso para tocar `specs/`.

---

### RF-18 · Estado derivado y re-derivación de la partida

El estado de una mano —ronda, localía, honba— no es una entrada: cuelga de los turnos anteriores. Por eso
hay que derivarlo una sola vez y re-derivarlo cuando cambia algo.

**Estado derivado**

- **RF-18.1** El sistema *debe calcular la ronda, la localía y el honba de cada turno a partir de los
  turnos anteriores*, y *no debe exigirlos como datos de entrada* del turno.
- **RF-18.2** El primer turno de una partida *debe empezar en ronda de Este, con el asiento Este como
  localía y honba 0*, de modo que el primer dealer es quien ocupa el asiento Este.
- **RF-18.3** Si *el dealer gana la mano*, el sistema *debe mantener la localía y aumentar el honba en
  uno*.
- **RF-18.4** Si *el dealer hace empate y conserva la tenpai*, el sistema *debe mantener la localía y
  aumentar el honba en uno*.
- **RF-18.5** Si *el dealer no conserva la tenpai*, el sistema *debe poner el honba a cero y avanzar
  la localía al siguiente asiento*, y *cuando la localía vuelva al asiento Este debe hacer avanzar
  también el viento de ronda al siguiente viento*.
- **RF-18.5b** Si *se registra un chombo*, el sistema ***no debe alterar ni el honba ni la localía ni el
  viento de ronda***: la mano se vuelve a repartir desde el mismo estado (**RF-7.6** de `../001/spec.md`).
- **RF-18.6** Si *el viento de ronda avanza más allá de Norte*, el sistema *debe devolverlo a Este*.
- **RF-18.7** Si *se corrige un turno ya guardado*, el sistema *debe volver a derivar todos los turnos
  posteriores de esa partida* y *debe reescribirlos en la misma operación*.
- **RF-18.8** Para *cada turno re-derivado*, el sistema *debe volver a calcular* su ronda, localía,
  honba, condición de renchan, bote de riichi, valor de la mano y deltas.
- **RF-18.9** Si *se borra un turno ya guardado*, el sistema *debe eliminarlo y volver a derivar todos los
  turnos posteriores* a partir del estado que quedó en el turno anterior, y *debe reescribirlos en la
  misma operación*.
- **RF-18.10** Si *se borra el último turno de una partida*, el sistema *debe permitir volver a capturar
  ese mismo número de turno*.
- **RF-18.11** Si *la re-derivación cambia si algún jugador queda por debajo de cero*, el sistema *debe
  recalcular el cierre obligatorio por bancarrota* de la partida en la misma operación.
- **RF-18.12** Si *una partida abierta tiene sus turnos re-derivados*, el sistema *debe volver a calcular
  su marcador y las estadísticas derivadas de la temporada*.
- **RF-18.13** El sistema *no debe re-derivar los campos capturados* —tipo de resultado, yaku, dora, fu,
  tenpai y jugador de cada asiento—, *que siguen siendo los que escribió quien capturó*.
- **RF-18.14** El sistema *debe escribir el turno corregido, los re-derivados y los derivados de la
  temporada en un único `WriteBatch` de Firestore*, de modo que *un fallo no deje la partida a medio
  recalcular*.

**Qué se vuelve a validar**

- **RF-18.15** Para *cada turno re-derivado*, el sistema *debe volver a comprobar* la resolución del
  turno, el invariante de cuadre y **la validez de los yaku de viento frente a la nueva ronda y la nueva
  localía**, porque RF-18.5 puede cambiar el viento de la ronda que los habilita.
- **RF-18.16** Si *alguna de esas comprobaciones falla en un turno posterior*, el sistema *debe rechazar
  la operación entera sin escribir ningún turno*, e *indicar el número del turno que la hace inviable y
  por qué*.
- **RF-18.17** Para *cada turno re-derivado*, el sistema *no debe volver a comprobar* las validaciones que
  dependen solo de campos capturados y que no han cambiado —fu, chiitoitsu, representabilidad de la
  combinación de han y fu y presencia de yaku real—, *porque su resultado no puede haber variado*.

**Límite con la bancarrota**

- **RF-18.18** Si *una partida tiene el cierre obligatorio por bancarrota activo*, el sistema *debe
  rechazar cualquier corrección o borrado de sus turnos*, y *solo debe permitir la acción de finalizar*
  de RF-0.4 y RF-10.6 de 001.
- **RF-18.19** Si *una re-derivación deja de ser necesaria porque la partida pasó a estar marcada por
  bancarrota*, el sistema *debe activar el cierre obligatorio en la misma operación*.

**Progresión y longitud de partida**

- **RF-18.20** La progresión de ronda, localía y honba *debe ser secuencial e independiente de la
  longitud declarada de la partida*: `tonpuusen` y `hanchan` avanzan igual.
- **RF-18.21** El sistema *no debe modelar el final de una ronda*: *cuando la localía completa las cuatro
  posiciones, la secuencia continúa como si corriera una ronda nueva*.

> **Por qué:** un resultado que depende del orden en que se corrigió no es verificable por nadie. La
> re-derivación completa es lo que convierte «corregí el turno 5» en una operación con consecuencias
> calculadas en lugar de una edición suelta. Y es lo que hace segura la re-derivación hacia atrás de
> RF-18.9: como cada turno guarda su propio estado, el estado anterior **está en el historial** y no hay
> que reconstruirlo de memoria.
>
> RF-18.20 y RF-18.21 son una **limitación declarada**, no una decisión: `docs/domain.md §2` describe un
> tonpuusen como «únicamente la ronda del Este», y la progresión secuencial no lo respeta cuando la
> partida se prolonga por encima del mínimo. Modelar el final de ronda es una decisión de reglas que el
> club todavía no ha tomado, y por eso queda en §7 como diferido con motivo, no como comportamiento
> heredado.

> **Cambio de dirección del contador, 2026-10-15.** RF-18.3 y RF-18.5 trading sus sentidos original:
> el honba contaba **las manos que el dealer no ganaba** y el club lo invirtió al de **las manos que el
> dealer lleva ganando**, que es como funciona en el reglamento de referencia. La consecuencia es que el
> contador **sube cuando la localía se conserva** y vuelve a cero cuando se pierde, así que la regla se
> reduce a una sola frase: *renchan sube el contador, perder la localía lo pone a cero*. Antes hacía
> falta separar `dealerWin` de `dealerTenpaiDraw` porque el empate con tenpai sumaba y la victoria no.
> RF-18.5b es el tercer caso: el chombo conserva la localía **pero no sube el contador**, así que no cabe
> ni en RF-18.3/18.4 ni en RF-18.5 y necesita su propio resultado de mano. Ver `docs/domain.md` §4.5
> desviación 8.

---

### RF-19 · Registro de correcciones

Corregir no es registrar. Registrar crea un turno; corregir lo reescribe. Si lo reescribe sin dejar
constancia, el rastro que RNF-2 promete no existe.

- **RF-19.1** El sistema *no debe modificar el autor de captura de un turno al corregirlo*: ese campo
  identifica a quien escribió la versión original del turno.
- **RF-19.2** Para *cada turno*, el sistema *debe registrar quién lo corrigió por última vez y cuándo*.
- **RF-19.3** Para *cada corrección de un turno*, el sistema *debe registrar en el registro de ese mismo
  turno* quién la hizo, cuándo y el valor anterior de cada campo modificado.
- **RF-19.4** Para *cada turno posterior que una corrección haya re-derivado*, el sistema *debe añadir su
  propia entrada de registro* indicando quién lo re-derivó, cuándo y qué campos cambió.
- **RF-19.5** Para *cada valor re-derivado por el sistema*, el sistema *debe distinguirlo en el registro
  de un valor que cambió una persona*, de modo que *un lector pueda ver qué parte del turno es cálculo y
  qué parte es captura*.
- **RF-19.6** Para *cada borrado de un turno*, el sistema *debe registrar quién lo borró, cuándo y los
  valores que tenía*, en el registro del turno inmediatamente anterior al borrado.
- **RF-19.7** Si *no existe un turno anterior al borrado* —porque se borra el primer turno o porque ya se
  había borrado su anterior—, el sistema *debe registrar el borrado en `games/{gameId}.turnAudit[]`*, que
  es el único sitio donde puede sobrevivir sin que el propio registro desaparezca con el turno.
- **RF-19.8** El sistema *debe permitir reconstruir la versión anterior de un turno* aplicando al
  contrario los valores anteriores registrados. **Reconstruir no es revertir**: ver el veto de §7.
- **RF-19.9** El sistema *no debe permitir modificar ni borrar un registro de corrección existente*.
- **RF-19.10** El sistema *debe mostrar a cualquier visitante quién corrigió cada turno y cuándo*, igual
  que muestra quién lo capturó, tanto si el registro está en el turno como si está en la partida.
- **RF-19.11** El sistema *no debe exigir un motivo* para corregir un turno.

**Escritura concurrente**

- **RF-19.12** Si *el número de correcciones de un turno ha cambiado entre la lectura y la escritura*, el
  sistema *debe rechazar la escritura por conflicto y no modificar nada*, en lugar de sobrescribir el
  registro con una versión que pierde la corrección ajena.
- **RF-19.13** El sistema *debe declarar que la inalterabilidad del registro la garantiza el cliente* y
  *no las reglas de seguridad*, porque `firestore.rules` concede escritura autenticada sobre el documento
  completo y no puede impedir que un array se sobrescriba entero.
- **RF-19.14** Si *añadir una entrada al registro de un turno pudiera superar el límite de tamaño de
  documento de Firestore*, el sistema *debe rechazar la corrección entera sin escribir nada*, e *indicar
  que el registro de ese turno ha alcanzado su límite*.
- **RF-19.15** Si *el número de turnos de la partida y el de correcciones de cada turno que tiene el
  sistema no coinciden con los que leyó al abrirla*, el sistema *debe rechazar la corrección y avisar*,
  en lugar de re-derivar sobre un estado desfasado, y *debe pedir que se sincronice antes de reintentar*.
- **RF-19.16** Si *el estado local de una partida está desfasado porque otro dispositivo escribió mientras
  este iba sin conexión*, el sistema *no debe perder la captura pendiente*: la conserva y la reintenta
  tras la sincronización, aunque la corrección que la acompaña se haya rechazado.

> **Por qué:** `games` ya resuelve este problema con `finalizationAudit[]` y funciona. Los turnos no lo
> tienen, y esa asimetría es la que hace que RNF-2 se cumpla para finalizar una partida y no para
> corregir un turno. Sin `derived` en el registro, quien lee no puede distinguir una mano que el sistema
> puntuó de una que alguien ajustó a mano, que es justo la diferencia que un club necesita ver.
>
> RF-19.4 y RF-19.6 existen por hallazgos concretos: si el registro de una corrección viviera solo en el
> turno corregido, un turno re-derivado no dejaría rastro de que su localía cambió; y si el registro de un
> borrado viviera en el turno borrado, **el borrado se llevaría por delante su propio registro**.
>
> RF-19.14 acota el único crecimiento no controlado que quedaba. Firestore admite 1 MiB por documento y
> el registro solo crece, así que un turno corregido muchas veces acabaría deixando de poder guardarse, y
> el fallo aparecería en la mesa y no en eltests. Prefiero un rechazo con su mensaje a un `failed-
> precondition` sin explicación.
>
> RF-19.15 y RF-19.16 son el caso sin conexión de RF-19.12. Re-derivar parte de los turnos locales, y con la
> caché local eso incluye lo pendiente en cola pero no lo que otro dispositivo escribió entretanto: la
> re-derivación sería silenciosamente incorrecta. Rechazar y pedir sincronización convierte un error
> invisible en uno visible, y RF-19.16 evita que el rechazo se lleve por delante el trabajo pendiente.

---

### RF-20 · Identificador de turno

- **RF-20.1** El sistema *debe identificar cada turno por su número escrito en decimal y sin relleno de
  ceros*: el turno 1 se llama `1` y el turno 10 se llama `10`.
- **RF-20.2** El sistema *debe ordenar los turnos por su campo numérico `turnNo`* y *no debe ordenar
  nunca por el identificador del documento*.
- **RF-20.3** El sistema *debe permitir registrar y mostrar una partida de más de 99 turnos*, conservando
  el orden de los turnos.

> **Por qué:** el identificador con relleno a dos dígitos rompe el orden lexicográfico a partir del turno
> 100, y ese techo llevaba dos revisiones abierto y sin resolver (001 → `D19`). Ordenar por el campo
> numérico, que ya existe y ya se usa en las consultas, deja de ser un problema en lugar de acotarlo.

---

### RF-21 · Captura de un ron múltiple

- **RF-21.1** Si *un turno termina por ron*, el sistema *debe permitir registrar uno, dos o tres
  ganadores*.
- **RF-21.2** El sistema *debe ofrecer en la lista de descartador solo a los jugadores que no han
  ganado*, y *debe ofrecer en la lista de ganador solo a los que no han sido descartador*.
- **RF-21.3** Si *se intenta seleccionar al ganador como descartador*, el sistema *no debe permitirlo*.
- **RF-21.4** Si *ganan varios jugadores en el mismo turno por ron*, el sistema *debe cargar al
  descartador la suma de los valores de todas las manos ganadoras*, y *debe adjudicar el bote de riichi
  entero al ganador de mayor valor*, con el asiento de Este a Norte como desempate.
- **RF-21.5** El sistema *no debe permitir registrar más de un ganador por tsumo*, y *debe rechazar la
  captura de una mano suufon renta* con un aviso propio, porque *el club ha declarado ese caso fuera de
  su juego*.

> **Por qué:** RF-6.1 y RF-5.4 de 001 ya exigen esto y el motor de `domain/turn.ts` ya lo resuelve, con
> test. Lo que faltaba era el camino para llegar hasta allí. Mientras no exista, un triple ron se guarda
> como un ron simple y el descartador paga una mano en vez de tres: un error de captura que **cambia
> puntos reales** y que ningún control posterior detecta, porque un turno así cuadra perfectamente.
>
> El *suufon renta* —cuatro ganadores por tsumo— es un caso de **tsumo**, no de ron, y por eso no entra en
> este bloque: queda **vetado por decisión del club** y registrado como derogación de 001 RF-6.5 y de
> `docs/domain.md` §2. El motor conserva la capacidad y su test sigue pasando; lo que desaparece es el
> camino para llegar a ella.

---

### RF-22 · Han derivado de los yaku

- **RF-22.1** Para *cada turno con resultado de mano*, el sistema *debe calcular los han de yaku
  sumando el han del catálogo de cada yaku seleccionado que cuente en esa mano*.
- **RF-22.2** El catálogo de yaku *debe declarar, para cada yaku, las condiciones en las que cuenta*:
  resultado de la mano, mano cerrada o abierta, riichi declarado, existencia de un kan, y ser la primera
  o la última mano de la partida.
- **RF-22.3** Si *un yaku seleccionado no cuenta en esa mano*, el sistema *debe señalarlo y excluirlo de
  la suma*, en lugar de sumarlo.
- **RF-22.4** Si *un yaku seleccionado es de límite*, el sistema *no debe sumar su han al total*, porque
  los yaku de límite tienen precedencia sobre el total y puntúan 8 000.
- **RF-22.5** El sistema *debe permitir ajustar a mano los han de yaku*, y *debe mostrar el total junto
  con el desglose de lo que aporta el catálogo y lo que aporta el ajuste*.
- **RF-22.6** Si *se ajusta a mano*, el sistema *debe mostrar que el total no coincide con el catálogo*,
  aunque lo permita.
- **RF-22.7** Para *cada turno con resultado de mano*, el sistema *debe exigir el número de dora*, y *debe
  sumarlo al total de han para el cálculo*, sin que el dora cuente como yaku.
- **RF-22.8** Si *no se ha seleccionado ningún yaku real*, el sistema *debe rechazar el turno aunque el
  ajuste manual eleve los han por encima de cero*: los dora y el ajuste no sustituyen a un yaku.
- **RF-22.9** Para *cada turno*, el sistema *debe guardar el ajuste a mano como un valor independiente del
  total*, de modo que el total siga siendo derivable re-aplicando el ajuste sobre la suma del catálogo.

> **Por qué:** el catálogo ya declara el han de cada yaku y nadie lo suma. Mientras el número se escriba
> aparte, el motor no añade nada sobre lo que ya sabía: es el mismo error de siempre con un formulario
> delante, que es el argumento que sostiene RF-16.1 en 001. El ajuste es un **delta sobre la suma del
> catálogo**, no un valor absoluto, porque un total absoluto haría imposible distinguir qué parte de la
> mano es cálculo y qué parte es captura.
>
> RF-22.2 y RF-22.3 cierran el hallazgo más caro de la revisión: sin ellas, marcar menzen tsumo en un ron
> sumaría un han que no cuenta, y el sistema propondría una puntuación que sabe que está mal.

---

### RF-23 · El formulario tras guardar

- **RF-23.1** Si *se confirma un turno*, el sistema *debe dejar el formulario en blanco para la captura
  siguiente*, reiniciando tipo de resultado, ganador, descartador, yaku, han, dora, fu, tenpai, chombo y
  declaraciones de riichi.
- **RF-23.2** Si *se confirma un turno*, el sistema *debe limpiar también el borrador del turno en curso*
  de RF-15.8 de 001, *de modo que al recargar no se restaure lo que se acaba de guardar*.
- **RF-23.3** Si *se confirma un turno*, el sistema *debe mostrar el estado derivado de la mano
  siguiente*: ronda, localía y honba, que ya son los que se capturarán.
- **RF-23.4** El sistema *no debe reiniciar el estado derivado* al guardar un turno, porque *no lo
  escribe quien captura*.
- **RF-23.5** Si *se cancela la captura de un turno*, el sistema *no debe modificar nada de lo ya
  guardado*.

> **Por qué:** hoy el formulario no se reinicia, así que el tipo de resultado, el ganador y los yaku del
> turno anterior siguen ahí, listos para volver a enviarse con el número nuevo. Es el fallo más fácil de
> cometer en la mesa y el más caro: duplica una mano entera con datos de otra.

---

## 5. Requisitos no funcionales

| # | Requisito | Por qué |
| --- | --------- | ------- |
| **RNF-1** | El resultado de una partida debe ser **idéntico** con independencia del orden en que se corrigieron sus turnos, y una partida corregida debe dar el mismo resultado que la misma partida capturada sin correcciones. | Es la condición que hace que corregir sea seguro. Si depende del orden, corregir es una segunda fuente de error |
| **RNF-2** | Cada corrección debe quedar **rastreable**: quién, cuándo, qué operación y el valor anterior de cada campo, tanto en el turno corregido como en los re-derivados | RNF-2 de 001 exige rastrear al capturador; sin esto se rastrea solo a la mitad de la historia |
| **RNF-3** | Aplicar de nuevo las reglas a una partida corregida debe **reproducir el mismo resultado**, porque el estado de cada turno se deriva de los anteriores y no de lo que quedó escrito | Es lo que convierte la re-derivación en comprobable con un test y no en una promesa |
| **RNF-4** | La captura sin conexión debe seguir funcionando: re-derivar un turno no puede exigir red | RNF-5 de 001; la re-derivación ocurre en cliente y la escritura se encola igual |
| **RNF-5** | Una re-derivación debe ser **atómica**: o se escriben el turno corregido y todos los re-derivados, o no se escribe ninguno | Un fallo a medio camino deja una partida que cuadra por casualidad y no por cálculo |
| **RNF-6** | RNF-1, RNF-3 y RNF-5 de 001 deben estar comprobados **por comportamiento**, no por aserción de configuración | Hoy `initializeFirestore` con caché local es lo único que se comprueba, y eso no demuestra que una captura sin red se sincronice |
| **RNF-7** | La re-derivación debe funcionar con **cualquier número de turnos** que admita el modo de partida | Con el techo de 99 eliminado, nada del sistema puede volver a depender del número de turnos |
| **RNF-8** | Dos dispositivos que corrigan el mismo turno **no deben perder ninguna corrección**: el sistema prefiere rechazar antes que sobrescribir un registro | 001 resolvió el conflicto de *crear* turnos con el rechazo del número duplicado; corregir no crea documentos y necesitaba su propia política |

---

## 6. Casos límite

### Estado derivado

1. **Primer turno de la partida.** Ronda Este, localía Este, honba 0, y el dealer es quien ocupa el
   asiento Este.
2. **El dealer gana por tsumo.** Renchan: la localía se mantiene y el honba aumenta en uno.
3. **El dealer gana por ron.** Igual que por tsumo: localía mantenida y honba en uno.
4. **El dealer hace empate con tenpai.** Renchan: la localía se mantiene y el honba aumenta en uno.
5. **Gana un jugador que no es dealer.** La localía avanza al siguiente asiento y el honba vuelve a
   cero.
6. **Cuarta localía de la ronda.** Cuando la localía vuelve al asiento Este, el viento de ronda avanza al
   siguiente viento.
7. **Cinco renchan seguidos.** El dealer conserva la localía todo el rato y el contador sube en cada
   renchan, así que el turno 5 se juega con honba 4.
8. **El viento de ronda pasa de Norte.** Vuelve a Este y el ciclo se repite.
9. **Chombo con honba activo.** La localía no avanza y el contador se queda en el valor que tuviera,
   así que la mano siguiente se reparte con el mismo dealer y el mismo honba.

### Corrección

9. **Corregir el primer turno de una partida de 18.** Se re-derivan los 17 siguientes y el resultado
   final es el de capturarla sin esa corrección.
10. **Corregir un turno que cambia quién ganó.** Cambian también el bote de riichi y los deltas de
    todos los turnos posteriores.
11. **Corregir un turno que añade un riichi.** El bote de los turnos posteriores cambia en 1 000.
12. **Corregir un turno que quita un riichi.** El bote de los turnos posteriores baja en 1 000.
13. **Corregir un tsumo y convertirlo en empate.** Cambian la localía, el honba y el renchan de todo lo
    que viene después.
14. **Corregir un turno y que un turno posterior quede imposible.** Se rechaza la corrección entera, no
    se escribe nada y se indica el número del turno que la hace inviable.
15. **Corregir un turno que hace que un yaku de viento deje de valer.** El turno posterior se rechaza
    entero con ese motivo.
16. **Corregir un turno dos veces.** Quedan dos entradas en el registro y el valor anterior más antiguo
    sigue siendo recuperable.
17. **Corregir un turno que hace que alguien pase de positivo a negativo.** La partida queda marcada
    como pendiente de cierre en la misma operación.
18. **Corregir un turno que deja de dejar a alguien por debajo de cero.** El cierre obligatorio se
    levanta en la misma operación.

### Borrado

19. **Borrar el turno 5 de 10.** Los cinco siguientes se re-derivan a partir del turno 4.
20. **Borrar el último turno.** Se puede volver a capturar ese mismo número.
21. **Borrar todos los turnos.** La partida queda abierta y sin turnos.
22. **Borrar el turno 1.** No hay turno anterior: el borrado queda registrado en la partida, no en un
    turno.
23. **Borrar dos turnos seguidos.** Cada borrado se registra en el turno que quedaba antes, y el segundo
    queda en la partida porque su anterior ya no existe.
24. **Borrar un turno y recapturarlo con otro resultado.** El resto de la partida vuelve al estado que
    tendría si nunca hubiera existido esa corrección.

### Identificador

25. **Partida de 100 turnos.** Los 100 se listan y se muestran en orden.
26. **Partida de 150 turnos con riichi declarado en varios.** El orden no depende del identificador.

### Captura

27. **Ron con un ganador.** El descartador paga la mano íntegra.
28. **Ron con dos ganadores.** Cada uno cobra su mano y el descartador paga la suma.
29. **Ron con tres ganadores.** Igual, y el bote va al de mayor valor.
30. **Intento de elegir como descartador a un ganador.** No aparece en la lista y no se puede seleccionar.
31. **Se marca un yaku y los han suben solos.** El total refleja el catálogo y se ve el desglose.
32. **Se sube el total a mano.** Se permite y se avisa de que ya no coincide con el catálogo.
33. **Se marca un yaku de límite.** Los han no suman su valor de referencia y la mano puntúa 8 000.
34. **Se marca menzen tsumo en un ron.** No cuenta: el sistema lo señala y no lo suma.
35. **Se marca ippatsu sin riichi declarado.** No cuenta: el sistema lo señala y no lo suma.
36. **Se marca rinshan en una mano sin kan.** No cuenta: el sistema lo señala y no lo suma.
37. **Se sube el total a mano sin marcar ningún yaku.** Se rechaza: ningún ajuste sustituye a un yaku.
38. **Se marcan yaku de viento que no corresponden al asiento o a la ronda.** Se rechaza.
39. **Tras corregir el turno 2, se recaptura el turno 2.** El ajuste manual del total se conserva y el
    catálogo vuelve a sumarse sobre él.

### Trazabilidad

40. **Consultar un turno corregido.** Se ve quién lo capturó, quién lo corrigió, cuándo y qué cambió.
41. **Consultar un turno re-derivado.** Tiene su propia entrada de registro con quién lo recalculó.
42. **Reconstruir el valor anterior de un turno.** Se obtiene aplicando al revés el registro.
43. **Visitante consultando una partida corregida.** Ve la misma información de corrección.
44. **Dos usuarios corrigiendo el mismo turno.** El segundo recibe un rechazo por conflicto y no se
    pierde ninguna de las dos correcciones.
45. **Un turno corregido mientras el otro dispositivo está sin conexión.** Al sincronizar, el conflicto se
    rechaza y la captura pendiente no se pierde, aunque no se aplique.
46. **Se intenta capturar un suufon renta.** Se rechaza con su aviso propio: solo cabe un ganador por tsumo.
47. **Se corrige un turno cuyo registro está al límite del documento.** La corrección se rechaza entera, no
    se escribe nada y el mensaje dice que el registro alcanzó su límite.
48. **Se corrige con la aplicación abierta hace mucho y sin sincronizar.** El estado local no cuadra con el
    del servidor: se rechaza y se pide sincronizar, sin perder el borrador.

---

## 7. Fuera de alcance

### Vetado explícitamente en esta etapa

- **Empezar una partida a mitad de hanchan.** El primer turno es siempre Este/Este/0. Una partida que se
  empieza en Sur-1 o en Este-3 no se puede registrar, y se declara en lugar de inventar una partida que
  empiece donde el sistema no espera.
- **Editar o borrar el registro de correcciones.** Es de solo anexado. Corregir una corrección se hace
  corrigiendo el turno otra vez, no reescribiendo la historia. Reconstruir la versión anterior de un turno
  tampoco es revertir: el sistema la puede mostrar, pero **volver a ella es corregir otra vez**, que a su
  vez queda registrado.
- **Imponer la inalterabilidad del registro desde `firestore.rules`.** No es posible dentro de un
  documento; ver RF-19.13.
- **Un historial de revisiones por partida.** Existe el de la finalización en 001
  (`finalizationAudit[]`) y el de los turnos. No hay uno que los mezcle.

### Vetado por decisión del club

- **El *suufon renta*.** Cuatro ganadores por tsumo dejan de ser capturables y el sistema rechaza la mano
  con un aviso propio (RF-21.5). La decisión **deroga 001 RF-6.5 y `docs/domain.md` §2**, que lo
  reconocían. El motor de `domain/turn.ts` conserva la capacidad y `turn.test.ts` → `'T27 · suufon
  renta'` sigue pasándose: lo que deja de existir es el camino para llegar a ella desde la captura.
  **No afecta a `tenhou` ni a `chiihou`**, porque un dealer puede completar su mano en la primera mano sin
  que la completen los otros tres.
  Queda escrito como derogación y no como afirmación técnica, porque el repositorio reconocía el caso en
  cuatro sitios y quien lea esto tiene que encontrar la decisión, no una frase rotunda que ya no se
  sostiene.

### Diferido, con motivo

- **El final de una ronda.** RF-18.20 y RF-18.21 hacen que la progresión sea secuencial e independiente de
  `gameLength`, así que un tonpuusen registrado con más de cuatro manos muestra la ronda de Sur. Modelar
  el final de ronda exige decidir qué es una prórroga y qué una ronda nueva, que es una decisión de reglas
  del club que todavía no se ha tomado.
- **El *suufon renta*.** 001 RF-6.5, `docs/domain.md §2` y el test `turn.test.ts` → `'T27'` reconocen
  cuatro ganadores por tsumo, y `domain/turn.ts` ya lo resuelve. **002 no lo cubre y no se declara
  imposible**: que sea o no alcanzable en el juego del club es una decisión de reglas que requiere una
  respuesta del club, y hasta que exista, el caso está sin resolver y no se puede escribir como
  descartado.

### Decidido para futuras especificaciones

- **003 · Interfaz de captura y lectura.** Los requisitos que no cambian el modelo: nombres de jugador
  en los desplegables, deltas en verde y rojo junto al marcador, buscador de yaku, riichi en horizontal,
  botón que dice «abortar» por debajo del mínimo, indicador de dealer y columna de viento por asiento,
  los dos modales de ayuda y de tabla, la diferencia de puntos al hacer clic en un jugador, y el filtro
  de jugadores activos al crear una partida. **Depende de esta especificación**: el indicador de dealer y
  la columna de viento necesitan que la localía la lleve el sistema.
- **004 · Verificación de la mano.** El indicador de dora y las fichas de la mano, que cierran el punto
  ciego que 001 §7 declara dos veces.
- **005 · Reglaset M.League.** `ruleset: 'mleague'` existe en el modelo y no admite captura. Cuando el
  club organice torneos habrá que definir sus reglas o retirar el valor del tipo.
- **Puntuación por mano (rating o ELO).**
- **Exportar e importar datos.** No habrá descarga de información ni carga masiva.
- **Notificaciones y recordatorios.**

---

## 8. Criterios de finalización

La especificación se considera cumplida cuando **todas** estas condiciones se cumplen. Cada una es
comprobable por un test, no por lectura del código.

### Sobre el estado derivado

1. El primer turno de una partida se guarda con ronda Este, localía Este y honba 0 sin que el capturador
   escriba ninguno de los tres.
2. Los tres valores de cada turno guardado coinciden con los que produce el estado derivado, y un test
   recorre dealer gana, dealer con tenpai, no dealer gana, el avance del viento al volver la localía a
   Este y el retorno del viento a Este después de Norte.
3. Corregir el turno N de una partida de 18 deja los 17 siguientes y el resultado final en el mismo
   estado, **con los mismos números**, que capturarla sin esa corrección.

### Sobre la re-derivación

4. Corregir un turno que cambia el ganador, el bote o el tipo de resultado reescribe los turnos
   posteriores, y la suma de deltas de la partida vuelve a cuadrar con la fórmula de conservación de
   puntos de `docs/domain.md` §5: 100 000 menos 1 000 por cada ficha de riichi sin reclamar. El chombo
   ya no aparece en la fórmula porque su penalización se reparte entre los demás jugadores.
5. Borrar un turno re-deriva todos los posteriores, y el estado resultante es el de una partida en la que
   ese turno nunca se hubiera capturado.
6. Una corrección que deja un turno posterior inválido se rechaza entera, **no escribe ningún turno** y
   el mensaje dice cuál es el turno que la hace inviable. El barrido incluye el caso de un yaku de viento
   que deja de valer por el cambio de ronda.
7. La re-derivación se escribe en un único `WriteBatch`, comprobado con un fallo inyectado que deja la
   partida sin cambios.
8. Borrar el primer turno y borrar dos turnos seguidos dejan su registro en el lugar que corresponde, sin
   que el borrado se lleve por delante su propio registro.

### Sobre la trazabilidad

9. Cada corrección conserva quién la hizo, cuándo, qué operación fue y el valor anterior de cada campo
   modificado.
10. Cada turno posterior que una corrección haya re-derivado tiene su propia entrada de registro.
11. El registro distingue el valor que cambió una persona del valor que recalculó el sistema.
12. La versión anterior de un turno se reconstruye aplicando al revés el registro, con un test que lo
    comprueba sobre un turno real del recorrido.
13. Corregir un turno no cambia su autor de captura, y sí deja quién lo corrigió y cuándo.
14. Un visitante ve la misma información de corrección que un usuario con cuenta, venga del turno o de la
    partida.

### Sobre la captura

15. Se puede registrar un ron con dos y con tres ganadores, y cada uno cobra su mano íntegra con el
    descartador pagando la suma.
16. El ganador no puede seleccionarse como descartador ni aparecer en su lista.
17. Los han de yaku se calculan al seleccionar los yaku, el desglose es visible y el ajuste manual está
    permitido y marcado.
18. Un yaku seleccionado que no cuenta en esa mano se señala y no suma: hay un test para menzen tsumo por
    ron, para ippatsu sin riichi y para rinshan sin kan.
19. Sin ningún yaku real seleccionado el turno se rechaza, aunque el ajuste manual eleve los han.
20. Al guardar un turno, el formulario queda limpio, **el borrador queda limpio** y se muestra el estado
    derivado de la mano siguiente.

### Sobre la identificación

21. Una partida de más de 99 turnos se registra, se lista y se muestra en orden, y el orden no depende del
    identificador del documento.

### Sobre la escritura concurrente

22. Dos correcciones simultáneas del mismo turno producen un rechazo de la segunda, y el registro
    conserva la primera.
23. Una corrección con el estado local desfasado se rechaza y pide sincronizar, y **no pierde el borrador
    ni la captura pendiente**.
24. Una corrección cuyo registro esté al límite del documento se rechaza entera, no escribe ningún turno
    y el mensaje dice que el registro alcanzó su límite.

### Sobre lo que queda vetado

25. Una mano con cuatro ganadores por tsumo se rechaza con su aviso propio, y ningún camino de la
    interfaz llega a `resolveTurn` con cuatro ganadores por tsumo.

### Sobre lo que ya se prometía

26. RNF-5 de 001 tiene un test que **corta la red**: se registra un turno sin cobertura y sincroniza
    después. Hoy solo se comprueba el cableado del SDK. **Es el criterio de mayor riesgo de esta
    especificación**: no hay precedente en el repositorio, y el único precedente que hay es el contrario,
    porque `rules.test.ts` pasó meses saltándose sin que nadie lo notara. Debe empezar por un experimento
    acotado antes de comprometerse, y si el experimento demuestra que no es alcanzable, se declara
    fuera de alcance con la decisión escrita y no se da por cumplido.
27. RNF-1 y RNF-3 tienen un test que varía capturador, dispositivo y orden de corrección, y una partida
    completa con reparto de riichi se recorre de extremo a extremo.
28. `typecheck`, `lint`, `test` y `format:check` pasan en ese orden, y la cobertura de `src/domain/` se
    mantiene en el 100 % de líneas, ramas y funciones.

---

## 9. Dudas resueltas

Las dudas que esta especificación dejó abiertas durante su redacción, y la decisión que las cierra. La
numeración **continúa** la de 001 §9, que terminó en la 27.

| # | Duda | Decisión | Consecuencia asumida |
| - | ---- | -------- | --------------------- |
| 28 | Qué hace `nextHand()`, que ya está escrito y probado, y que solo usa su test | Pasa a ser la única fuente del estado derivado, y se le añade el recorrido de turnos completos | No se escribe lógica de localía nueva: se conecta la que había |
| 29 | Si corregir un turno puede dejar los siguientes desfasados | No: se re-derivan todos, en la misma operación | Una corrección escribe tantos documentos como turnos quedan. En una partida real son entre 8 y 20, muy por debajo del límite de 500 escrituras de Firestore |
| 30 | Si la re-derivación pisa la localía que escribió quien capturó | Sí, y lo marca en el registro como valor derivado | El registro es lo que impide que eso parezca captura |
| 31 | Dónde vive el registro de correcciones | En un array dentro del documento del turno, igual que `finalizationAudit[]` de `games` | Una regla de seguridad menos y ningún grupo de colección nuevo |
| 32 | Si el registro de correcciones lleva un motivo | No | En una corrección de captura el motivo es ruido; el diff ya dice qué pasó |
| 33 | Si el han de yaku se deriva del todo | Se deriva, con el ajuste manual encima | El campo deja de ser libre, pero no se bloquea |
| 34 | Si un ajuste manual puede sustituir a un yaku | No: sin al menos un yaku real el turno se rechaza | El ajuste mueve el total dentro de lo que el catálogo permite, no crea la mano |
| 35 | Si se puede empezar una partida a mitad de hanchan | No: el primer turno es Este/Este/0 | Una partida empezada a medias no se registra. Se declara en §7 en lugar de inventar un estado inicial |
| 36 | Si un ron múltiple se admite ya o se bloquea | Se admite: hasta tres ganadores | El motor ya lo resolvía con test. La interfaz era el único camino que faltaba |
| 37 | Si el identificador del turno conserva el relleno con ceros | No: es el número del turno en decimal, y el orden lo fija el campo numérico | El techo de 99 turnos desaparece en lugar de acotarse. La regla del relleno se retira de `AGENT.md` |
| 38 | Si re-derivar exige conexión | No: ocurre en cliente y la escritura se encola como cualquier otra | RNF-5 de 001 no se ve afectada |
| 39 | Si deshacer una finalización de 001 sigue funcionando | Sí, y ahora también re-deriva: deshacer deja la partida abierta y a partir de ahí manda RF-18 | La auditoría de la finalización y la del turno son registros distintos y no se mezclan |
| 40 | Si el ajuste manual es un delta o un valor absoluto | Un **delta** sobre la suma del catálogo, guardado aparte | El total sigue siendo derivable, y se distingue lo que aportó el catálogo de lo que aportó la persona |
| 41 | Dónde queda registrado un turno que una corrección re-derivó | En su propio registro, con una entrada por turno afectado | El registro se lee turno a turno, que es como se lee un histórico |
| 42 | Dónde queda registrado el borrado de un turno | En el registro del turno anterior; si no hay anterior, en `games.turnAudit[]` | El borrado del primer turno y los borrados seguidos no se quedan sin rastro |
| 43 | Qué validaciones se repiten al re-derivar | La resolución del turno, el invariante de cuadre y los yaku de viento. Las demás no, porque dependen de campos que no cambian | Los yaku de viento son los únicos cuyo valor depende de la ronda, y RF-18.5 puede cambiarla |
| 44 | Qué es una «operación atómica» | Un único `WriteBatch` de Firestore | No es una transacción: la re-derivación ocurre en cliente antes de escribir |
| 45 | Qué pasa si dos dispositivos corrigen el mismo turno | El segundo se rechaza por conflicto y no se pierde ninguna corrección | Es la misma política de rechazo que RF-3.8 de 001 usa para el turno duplicado |
| 46 | Se puede corregir con la partida marcada por bancarrota | No: 001 RF-0.4 y RF-10.6 se mantienen enteros | Una partida marcada no admite correcciones ni borrados, y no hay excepción |
| 47 | Si el *suufon renta* es alcanzable | **Vetado por decisión del club.** La captura de cuatro ganadores por tsumo se rechaza y se derogan 001 RF-6.5 y `docs/domain.md` §2 | El motor conserva la capacidad y su test sigue pasando: lo que desaparece es el camino. `tenhou` y `chiihou` no se ven afectados |
| 48 | Si la progresión depende de la longitud de la partida | No, y tampoco modela el final de ronda | Un tonpuusen largo muestra la ronda de Sur. Es una limitación declarada, no una regla |
| 49 | Qué pasa si el registro de correcciones crece sin límite | Se acota: al superar el límite de documento de Firestore, la corrección se rechaza entera con su mensaje | Prefiero un rechazo explícito a un `failed-precondition` sin explicación en mitad de una partida |
| 50 | Qué pasa si se re-deriva con la caché local desfasada | Se rechaza y se pide sincronizar, sin perder borrador ni captura pendiente | Convierte un error silencioso en visible. Es el caso sin conexión de RF-19.12 |

---

## 10. Nota para el plan técnico

Este documento define **qué** debe hacer el sistema y **por qué**. Las decisiones de tecnología,
arquitectura y organización del código no forman parte de esta especificación y van en el plan técnico.

Se hacen notar siete decisiones que condicionarán ese plan:

1. **Lo que ya existe se conecta, no se reescribe.** `nextHand()` está escrito y probado; el motor de
   `turn.ts` ya resuelve el ron múltiple, el bote y la bancarrota con test; `finalizationAudit[]` ya es
   el patrón de auditoría. El trabajo de dominio es añadir el recorrido de turnos y el reparto del bote
   en su mitad posterior, no reconstruir el cálculo.
2. **Re-derivar es una función pura de `domain/` que recorre turnos**, y una escritura de cliente que la
   llama. Constitution V.1 impide que el recorrido viva en un composable: tiene que ser puramente
   determinista y estar cubierta al 100 %.
3. **El rechazo por conflicto es de lectura-verificación**, no una transacción: se lee el registro, se
   comprueba que no cambió y se escribe. Es la misma política que RF-3.8 de 001, y significa que
   `turnsRepository.update` deja de ser una escritura ciega para exigir una comprobación previa.
4. **El catálogo de yaku gana un campo que dice cuándo cuenta cada yaku**, y esa es la parte de dominio
   con más riesgo de esta especificación: `YAKU_CATALOG` alimenta a la vez la suma de han, la validación
   de viento y las estadísticas, así que añadir el campo obliga a revisar las tres y a probar cada yaku
   situacional en su contexto. La suma de han, además, tiene que filtrar los yaku de límite por
   `category`, que es la trampa que `AGENT.md` ya advierte: su `han` es un valor de referencia y no se
   suma nunca.
5. **El registro de correcciones añade campos al turno y un array a la partida**, no una colección. Eso
   obliga a actualizar la tabla de modelo de datos de `AGENT.md` y la de `plan.md` §4.1, igual que hizo
   el anexo de 001 al añadir `game.ts` y dos páginas.
6. **Las tres derogaciones de texto —RF-3.13, RF-4.3 y RF-6.5— se escriben en `specs/001/spec.md` antes de
   implementar**, en una tarea propia que abra el plan, como se hizo con RF-15.9 en la fase 14 de 001.
   Constitution I.1 exige además que esa escritura se pida de forma explícita, porque modificar `specs/`
   no está cubierto por el encargo de redactar 002.
7. **El criterio 26 de §8 es el que puede no cumplirse**, y el plan tiene que tratarlo como riesgo y no
   como formalidad: si el experimento previo dice que no se puede cortar la red en las pruebas, la
   respuesta es declarar el criterio fuera de alcance por escrito, no rebajarlo en silencio.

Además, RNF-6 de este documento exige que RNF-1, RNF-3 y RNF-5 de 001 dejen de comprobarse por
configuración. Eso no añade funcionalidad: **cambia el tipo de test** de tres requisitos que ya están
marcados como cumplidos, y por eso pertenece a esta especificación y no a `003`.