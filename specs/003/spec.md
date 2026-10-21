# spec.md — 003 · La mesa en la pantalla

**Estado:** requisitos cerrados, lista para la revisión de calidad
**Alcance:** lo que la pantalla de captura y la de lectura todavía no muestran, más los tres huecos que dejó el rastreo RF a RF de 002
**Continuación de:** [`../002/spec.md`](../002/spec.md), que se da por cerrada
**Reglas de puntuación:** [`../../docs/domain.md`](../../docs/domain.md)
**Revisión de calidad:** [`../../docs/reviews/003-qa.md`](../../docs/reviews/003-qa.md)

---

## 0. Relación con `specs/001` y `specs/002`

Esta especificación **complementa** a 001 y 002: no reemplaza ni reescribe ninguna de las dos. Todo
requisito de 001 y de 002 sigue vigente salvo los que se declaran aquí, y **003 no toca el modelo de
datos**: no añade campo, ni documento, ni regla de seguridad.

De 002 **hereda** RF-18.1, que ya exige que el estado derivado se muestre en lugar de capturarse, y lo
extiende: 002 lo mostró como texto de solo lectura, y 003 lo convierte en **una mesa de juego** con la
localía marcada y el viento por asiento. De 001 **hereda** RF-2.9, que permite que un jugador participe
en dos partidas abiertas, y que el filtro de jugadores activos de RF-27 **no puede romper**.

De 002 **asume** tres requisitos que aquel dejó sin cerrar, y los declara aquí porque 003 es quien los
cierra:

| RF de 002 | Por qué lo asume 003 | Dónde |
| --------- | -------------------- | ----- |
| **RF-19.8** | Falta la **capacidad**, no solo el test: no existe ninguna función que reconstruya un turno en su versión anterior. Un requisito de trazabilidad sin capacidad es trabajo de modelo, no de interfaz, así que se hace aquí y no en un parche suelto | RF-30.1 a RF-30.3 |
| **RF-18.20** | Está medio cubierto: «secuencial» sí, «independiente de la longitud declarada» no | RF-30.4 |
| **RF-19.11** | Se cumple por construcción —el tipo no tiene dónde poner un motivo— y por eso nadie lo notaría si dejara de cumplirse | RF-30.5 |

De 001 **asume** también **RF-9.2**, cuyo texto de interfaz quedó diferido: la tabla de derogaciones de
`specs/002/spec.md` §4 lo pasó a 003 con la frase *«el texto del botón es una decisión de interfaz»*. Se
cierra en RF-29.

Las dudas de §9 continúan la numeración de `specs/002/spec.md` §9. La revisión que motivó esta escritura
está en [`../../docs/reviews/003-qa.md`](../../docs/reviews/003-qa.md), con 16 hallazgos.

---

## 1. Contexto y objetivo

### Contexto

`specs/001` construyó la aplicación y `specs/002` la hizo verificable: el estado de cada turno lo lleva
el sistema, corregir un turno re-deriva los siguientes, y cada corrección queda registrada con quién la
hizo, cuándo y qué cambió. Todo eso está comprobado por tests.

Lo que **no** está es **legible**. Capturar un turno es hoy un ejercicio de memoria: los desplegables
dicen «Este», «Sur», «Oeste», «Norte» en vez del nombre de quien está sentado ahí; el marcador no dice
cuánto ha perdido nadie; no hay ninguna marca de quién es la localía; la lista de yaku son treinta y
tres entradas en una caja de desplazamiento; y el botón que cierra una partida lleva un texto que
promete un estado que el sistema no produce.

El club juega a cuatro personas alrededor de una mesa, mirando la pantalla. La pantalla es el único
sitio donde está la información de la partida mientras se juega.

### Objetivo

Que en la pantalla de captura se vea **quién es cada jugador, cuál es la localía, qué viento corre, cómo
va el marcador y qué acaba de pasar**, sin que nadie tenga que recordar lo que ya está escrito en el
documento de la partida.

En una frase: **003 convierte el formulario de captura en la mesa de juego.**

### Lo que 003 NO es

003 **no cambia el modelo de datos**. Ni un campo nuevo, ni un documento nuevo, ni una regla de
seguridad nueva, ni una línea de `src/domain/`. Es lo que `specs/002/spec.md` §7 dejó escrito:
*«los requisitos que no cambian el modelo»*.

Esa condición es la que hace que 003 sea pequeño, y también la que tiene una consecuencia que hay que
decir aquí y no dejar implícita: **la puerta de constitution IV.1 no muerde en esta especificación**. El
100 % de `src/domain/` se conserva solo, sin trabajo de nadie. El plan técnico tiene que poner otra
puerta, y la pone: ver `plan.md` §6.1 y el criterio 26 de §8.

---

## 2. Usuarios

003 **no añade usuarios**. Trabaja para los mismos tres de 002 §2, y para uno de ellos cambia lo que ve:

| Usuario | Qué le pasa en 003 |
| ------- | ------------------ |
| **Invitado** | No cambia. Solo lee, y lo que lee ahora incluye la mesa |
| **Conductor de la sesión** | Es el que cambia: quien escribe los turnos pasa a ver la mesa y no una lista de identificadores |
| **Espectador** | Puede seguir el marcador de una partida abierta leyendo la mesa |

---

## 3. Historias de usuario

- **HU-16.** *Como quien está en la mesa, quiero ver los nombres y no los asientos en los desplegables,
  para no tener que recordar quién está sentado en Este.*
- **HU-17.** *Como quien está en la mesa, quiero ver cuánto ha ganado o perdido cada uno en el turno que
  estoy escribiendo, para no equivocarme al anotar.*
- **HU-18.** *Como quien está en la mesa, quiero ver quién es la localía y qué viento corre, para saber
  qué puntos van en juego en esta mano.*
- **HU-19.** *Como quien está escribiendo, quiero encontrar un yaku escribiendo parte de su nombre, para
  no recorrer treinta y tres casillas con la rueda del ratón.*
- **HU-20.** *Como quien está escribiendo, quiero ver las casillas de riichi en una fila, para no
  buscarlas con el dedo entre los otros once campos.*
- **HU-21.** *Como quien no ha usado nunca la aplicación, quiero poder abrir una ayuda y entender cómo se
  rellena el formulario, sin salir de la pantalla.*
- **HU-22.** *Como quien no recuerda la tabla de puntos, quiero verla sin abrir la página de reglas.*
- **HU-23.** *Como espectador de una partida, quiero hacer clic en un jugador y ver su diferencia de
  puntos contra cada rival, para no tener que restar dos cifras de la columna.*
- **HU-24.** *Como quien crea una partida, quiero ver primero a los jugadores dados de alta, y saber por
  qué un jugador que busco no aparece arriba.*
- **HU-25.** *Como club, quiero que el botón que cierra una partida diga lo que hace, y no prometa un
  estado que el sistema no produce.*

---

## 4. Requisitos funcionales

Cada criterio está expresado en notación EARS: *Cuando …*, *Si …*, *Mientras …*, *Si no …* o
*El sistema …*.

### RF-24 · La mesa en la pantalla de captura

- **RF-24.1** Para *cada desplegable de jugador del formulario de turnos* —ganador, descartador, tenpai,
  riichi y chombo—, el sistema *debe ofrecer el nombre del jugador y no solo su asiento*, y *debe mantener
  el asiento visible junto al nombre*.
- **RF-24.2** Para *cada jugador de la mesa*, el sistema *debe mostrar su puntuación junto al marcador* y
  *debe mostrar en color positivo el valor del delta que suma y en color negativo el que resta*, usando
  los tokens `--color-mahjong-positive` y `--color-mahjong-negative` del tema, y *no debe* aplicar
  clases de color fuera de esos tokens.
- **RF-24.3** Para *cada jugador de la mesa*, el sistema *debe señalar quién es la localía del turno que se
  está capturando*, tomando **la localía real que el sistema calcula** y no el asiento Este.
- **RF-24.4** Para *cada asiento de la mesa*, el sistema *debe mostrar el viento de la mano en curso* junto
  al nombre del jugador.

> RF-24.3 y RF-24.4 dependen de que la localía y el viento los lleve el sistema, que es RF-18.1 de 002.
> Sin 002 no hay nada que señalar. Y RF-24.3 tiene que mirar la localía **real**: hasta `specs/002` el
> motor miraba `seat === 'east'` en vez de la localía, y a partir del primer cambio de localía eso
> invertido — ver `turn.test.ts:688`. Una etiqueta pintada desde el asiento Este daría razón
> equivocada a quien juegue a partir del segundo turno, que es toda la partida, y ningún test de motor
> saltaría por ello.

### RF-25 · Capturar sin buscar

- **RF-25.1** El selector de yaku *debe permitir filtrar por texto* las entradas que contengan lo
  escrito, y *debe dejar vacío el filtro cuando no haya coincidencia* sin perder las marcadas.
- **RF-25.2** Las casillas de declaración de riichi *deben mostrarse en horizontal*, y *no deben*
  cambiar su comportamiento al hacerlo.

### RF-26 · Leer el resultado

- **RF-26.1** Si *se hace clic en un jugador en el detalle de una partida*, el sistema *debe mostrar,
  junto a cada uno de los otros tres asientos, la diferencia de puntos de ese jugador contra el rival
  de ese asiento*, calculada como su marcador menos el marcador del rival.
- **RF-26.2** Si *dos jugadores tienen el mismo marcador*, el sistema *debe mostrar esa diferencia como
  cero*, y *no debe* mostrar una celda vacía.

### RF-27 · Jugadores activos

- **RF-27.1** Al *crear una partida*, el sistema *debe ofrecer primero los jugadores dados de alta*, y
  *debe ofrecer después los que no lo están*, marcados con el motivo.
- **RF-27.2** Al *crear una partida*, el sistema *no debe impedir elegir un jugador que ya participa en
  otra partida abierta*, porque RF-2.9 de 001 lo permite, y *debe avisar* de ello.
- **RF-27.3** Si *todos los jugadores del club están dados de baja o ya ocupan la partida*, el sistema
  *debe seguir permitiendo completarla*, aunque para eso haya que elegir a alguien de más.

### RF-28 · Ayuda y referencia

- **RF-28.1** El sistema *debe ofrecer un modal de ayuda* alcanzable desde la pantalla de captura, cuyo
  contenido explique cómo se rellena el formulario de turnos.
- **RF-28.2** El contenido del modal de ayuda *debe venir de un único documento markdown del
  repositorio*, importado en tiempo de compilación, y *no debe* estar duplicado en el código.
- **RF-28.3** Un test *debe leer ese documento desde el disco* y comprobar que es el mismo que la
  interfaz pinta, de modo que el texto no pueda driftar sin que nada lo note.
- **RF-28.4** El sistema *debe ofrecer un segundo modal con la tabla de puntuación*, mostrada como la
  imagen que el club aporta. La ruta de la imagen *debe estar declarada en `spec.md` §8*, de modo que
  borrarla o moverla rompa el build.
- **RF-28.5** Si *se abre o se cierra cualquiera de los dos modales*, el sistema *no debe perder lo
  capturado*: el borrador de `localStorage` y los valores del formulario *deben seguir exactamente
  como estaban*.

> La imagen del modal de la tabla es una **instantánea**, no una fuente. La tabla de verdad vive en
> `docs/domain.md` §4.2 y `handValue.test.ts` la lee y la comprueba contra el motor. Una imagen no
> tiene esa propiedad: el día que cambie una fila, seguirá diciendo lo que decía y nada en el
> repositorio lo detectará. **RF-28.4 puede garantizar que la imagen existe y está referenciada; no
> puede garantizar que su contenido coincida con el documento**, y conviene decirlo en voz alta
> antes de dar el requisito por cerrado.

### RF-29 · Abortar deja la partida inconclusa

- **RF-29.1** El botón que cierra una partida por inactividad *debe decir «abortar»*, y *no debe* usar la
  palabra «abandonar».
- **RF-29.2** El aviso de confirmación de ese botón *debe decir que la partida queda inconclusa*, y
  *no debe* decir que queda abortada.
- **RF-29.3** El estado `aborted` *debe seguir alcanzándose solo al finalizar por debajo del mínimo de
  turnos* —RF-9.2 de 001—, y la interfaz *no debe* describir con la palabra «abortar» ningún otro
  resultado.

> **Decisión del club del 2026-10-15.** Tres piezas no concordaban: el botón decía «Abandonar partida», el
> aviso decía *«se marcará como abortada»*, y lo que ocurría era `unfinished`, que se pinta como
> «Inconclusa». El aviso mentía. El club elige «abortar» para el botón, y el resultado se describe
> siempre como inconcluso.
>
> La consecuencia es que **«abortar» y `aborted` son la misma palabra y no la misma cosa**:

| Estado | Se alcanza con | Se describe como |
| ------ | -------------- | ---------------- |
| `unfinished` | el botón de los 7 días | **Inconclusa** |
| `aborted` | finalizar por debajo del mínimo | Abortada |

> No es un error, es vocabulario. Pero el par «abortar la partida» / «queda abortada» **no puede
> aparecer en la misma pantalla**, porque diría dos cosas distintas a la vista y una sería falsa. De ahí
> que RF-29.3 exista.

### RF-30 · Cerrar los huecos que dejó 002

- **RF-30.1** Para *cada turno con registro*, el sistema *debe poder obtener los valores que tenía de sus
  campos capturados antes de la última corrección*, leyéndolos de la entrada más reciente del registro.
- **RF-30.2** La reconstrucción de RF-30.1 *no debe* aplicarte los campos derivados —ronda, localía,
  contador, `value[]` y `deltas[]`— desde el registro, porque esos los recalcula el sistema (RF-18.13 de
  002) y restaurar un valor calculado a mano contradice esa regla en el mismo cambio que la cumple.
- **RF-30.3** Los valores derivados de la versión anterior *deben obtenerse volviendo a derivar la
  partida*, y *no* deben salir del registro.
- **RF-30.4** Para *la misma secuencia de turnos*, el resultado del recorrido *debe ser idéntico* registre
  la partida como `tonpuusen` o como `hanchan`, y un test *debe comprobarlo* con una partida de más de
  cuatro manos en cada modo.
- **RF-30.5** El registro de correcciones de un turno *no debe tener campo de motivo*, y un test *debe
  afirmar* que ni el tipo ni la lista de campos corregibles lo incluyen.
- **RF-30.6** El test del formulario que afirma que un chombo conserva la localía *debe llamarse
  diciendo eso*, y *no debe* afirmar que la localía avanza.

---

## 5. Requisitos no funcionales

003 hereda los ocho de `specs/002/spec.md` §5 y **no deroga ninguno**. Los que condicionan esta
especificación:

| RNF | Qué obliga aquí |
| --- | --------------- |
| **RNF-1** | El resultado de una partida no depende de quién escribió el turno ni del orden en que se corrigió. RF-30 lo reinforce |
| **RNF-7** | Nada puede volver a depender del número de turnos. RF-30.4 lo comprueba por primera vez |
| **RNF-8** | Nada de lo que se añade puede filtrar datos de otros: los dos modales muestran contenido estático y texto del propio club |

Los cinco restantes siguen vigentes sin cambio. En particular **V.1**: los modales muestran un documento
del repositorio y una imagen del club, y **ninguno de los dos sale de `data/` ni de Firebase**.

---

## 6. Casos límite

### Sobre la mesa de la captura

1. **Partida recién creada, sin turnos.** El marcador muestra el punto de partida de los cuatro y no hay
   ningún delta que pintar.
2. **Delta cero.** Un empate repartido deja a alguien con delta cero; ese jugador se muestra **sin color**,
   no en positivo ni en negativo.
3. **Más de un ganador.** Las tres casillas de ganador llevan el nombre de quien ganó y su asiento, y el
   marcador muestra el delta acumulado de los tres.
4. **Localía que no es el Este.** A partir del segundo turno la localía es otro asiento, y la marca de
   localía *no* acompaña al Este.
5. **Chombo.** La marca de localía no se mueve al guardar un chombo, porque el chombo conserva la localía
   (RF-7.6 de 001).

### Sobre el filtro de jugadores

6. **Todos los jugadores están en otra partida abierta.** El desplegable los ofrece a todos, marcados,
   y no impide crear la partida.
7. **Ningún jugador está dado de alta.** Se pueden elegir igualmente; el aviso dice que no lo están.
8. **Un jugador aparece repetido en dos asientos.** La interfaz *no debe* ofrecer el mismo jugador en dos
   casillas: es la regla de RF-2.8 de 001.

### Sobre la ayuda

9. **Abrir la ayuda con el formulario a medio rellenar.** Al cerrarlo, todo sigue igual, incluido el
   borrador de `localStorage`.
10. **Abrir la ayuda sin sesión.** El modal se abre igual: es contenido estático y no depende de la
    sesión.
11. **La imagen de la tabla no está en el build.** El build falla. No hay una imagen de reserva que
    sustituya a la del club, porque una tabla inventada es peor que ninguna.

### Sobre RF-30

12. **Un turno sin correcciones.** La reconstrucción de RF-30.1 devuelve que no hay versión anterior, y
    no un turno vacío.
13. **Dos correcciones sobre el mismo campo.** La versión anterior es la de **antes de la más reciente**,
    no la de antes de la primera.
14. **Una corrección que solo cambió campos derivados.** Los capturados no cambian, y la reconstrucción
    no inventa nada.
15. **`tonpuusen` de diez manos.** Avanza exactamente igual que un `hanchan` de diez.

---

## 7. Fuera de alcance

### Vetado explícitamente en esta etapa

- **Exportar e importar datos.** No habrá descarga de información ni carga masiva.
- **Notificaciones y recordatorios.** No se enviarán avisos por ningún medio.

### Decidido para futuras especificaciones

- **004 · Verificación de la mano.** El indicador de dora y las fichas de la mano siguen siendo 004, y
  siguen dependiendo de que alguien captifique el reparto.
- **005 · Reglaset M.League.** `ruleset: 'mleague'` existe en el modelo y no admite captura.
- **Puntuación por mano (rating o ELO).**
- **El final de una ronda.** RF-18.21 de 002 lo declara no modelado, y 003 no lo modela.
- **La captura sin conexión comprobada por test.** El experimento de
  [`../../docs/reviews/002-red.md`](../../docs/reviews/002-red.md) concluyó que `happy-dom` no expone
  `indexedDB`, que no hay emulador y que el test saldría **a internet**. El criterio 26 de 002 quedó
  declarado fuera de alcance y 003 **no lo reabre**: los modales son de lectura, no capturan nada y no
  escriben, así que **003 hereda esa deuda y no puede pagarla**. Reabrirlo seguiría exigiendo las mismas
  tres cosas: emulador, `IndexedDB` real y `fetch` bloqueado.

### Fuera de alcance por definición de esta especificación

- **Cualquier cambio en `src/domain/`.** Si una fase necesita escribir en el dominio, esa fase está mal
  planteada y vuelve aquí.
- **Cualquier campo, documento o regla de seguridad nuevo.**
- **Reordenar o rediseñar el formulario.** 003 añade señales a lo que ya hay; no lo rehace.

---

## 8. Criterios de finalización

La especificación se considera cumplida cuando **todas** estas condiciones se cumplen. Cada una es
comprobable por un test o por una medición, no por lectura del código.

### Sobre la mesa y la captura

19. Los desplegables de jugador ofrecen el nombre con su asiento, y los cinco del formulario hacen lo
    mismo.
20. El marcador muestra el delta de cada jugador con el color de los tokens del tema, y el color es el
    correcto para el signo.
21. La marca de localía acompaña a la localía **real**, y un test lo fija con la localía en el asiento
    Sur, donde el Este ya no la es.
22. El viento de la mano en curso aparece junto a cada asiento.
23. El selector de yaku filtra por texto y no pierde las casillas ya marcadas al filtrar.
24. Las casillas de riichi se renderizan en horizontal.

### Sobre el resultado, los jugadores y la ayuda

25. La imagen de la tabla de puntuación **existe en el repositorio**, su ruta está declarada más abajo,
    y un test falla si no se encuentra. La coincidencia de su contenido con `docs/domain.md` §4.2 **no es
    comprobable** y queda declarado.
26. Abrir y cerrar cualquiera de los dos modales deja el formulario y el borrador intactos.
27. El test de markdown de RF-28.3 lee el documento del disco y encuentra el mismo texto que la interfaz
    pinta.
28. El filtro de jugadores ofrece los activos primero, marca los inactivos y no impide elegir a alguien
    que ya está en otra partida abierta.
29. El botón dice «abortar» y su aviso dice «inconclusa». Ninguna pantalla usa «abortada» para el estado
    `unfinished`.

### Sobre RF-30

30. Existe una función que devuelve los campos capturados de la versión anterior de un turno corregido,
    y no toca los derivados.
31. Un turno sin correcciones devuelve que no hay versión anterior.
32. El mismo recorrido da el mismo resultado en `tonpuusen` y en `hanchan` con la misma secuencia de
    turnos de más de cuatro.
33. Un test afirma que el registro no tiene campo de motivo.
34. El nombre del test del chombo dice que conserva la localía.

### Sobre el método

35. **`src/domain/` no ha cambiado.** Se verifica con `git diff` y el resultado tiene que estar vacío.
36. Cada comportamiento de pantalla de §4 tiene al menos un test de componente, y la puerta de 003 es
    esa, **no** la cobertura de `domain/`.
37. `typecheck`, `lint`, `test` y `format:check` pasan en ese orden.

**Ruta de la imagen de la tabla de puntuación**, declarada por RF-28.4:
`src/assets/tabla-puntuacion.png`. **Pendiente de que el club la aporte.**

---

## 9. Dudas resueltas

| # | Duda | Decisión | Consecuencia asumida |
| - | ---- | -------- | --------------------- |
| 1 | Si 003 incluye los huecos de 002 | **Sí**, y se declaran en §0 para que conste de quién son | RF-19.8 es trabajo de modelo colado en una spec de interfaz. Se acepta porque el club lo pidió y porque un requisito de trazabilidad sin capacidad no es un requisito |
| 2 | Qué palabra lleva el botón que cierra la partida | **«Abortar»**, y el resultado se describe como **inconclusa** | «Abortar» y `aborted` significan cosas distintas. De ahí RF-29.3 |
| 3 | De dónde sale el texto del modal de ayuda | De **un documento markdown del repositorio**, importado con `?raw` | Hay que declarar el módulo y escribir el test de RF-28.3, o el texto driftaría solo |
| 4 | De dónde sale la tabla de puntos del segundo modal | De una **imagen que aporta el club** | Su contenido no puede comprobarse. Se declara en RF-28.4 y en el criterio 25 |
| 5 | Si el filtro de jugadores activos **oculta** a los inactivos | **No.** Los lista después, marcados con el motivo | Un filtro que los escondiera rompería RF-2.9 de 001 y dejaría sin candidatos a un club entero dado de baja |
| 6 | Si el filtro impide repetir jugador entre partidas abiertas | **No**, solo avisa | Es lo que RF-2.9 de 001 ya permite |
| 7 | Si «reconstruir la versión anterior» es un deshacer campo a campo | **No.** Los capturados salen del registro y los derivados se recalculan | Es lo correcto según RF-18.13 de 002, y evita que un valor calculado vuelva a entrar como si fuera capturado |
| 8 | Qué puerta de cierre tiene 003 | **`src/domain/` congelado** más un test por comportamiento de pantalla | La cobertura de `domain/` no muerde aquí porque nadie escribe en él. Dejar la puerta de constitution IV.1 sería un criterio vacío |
| 9 | Si el nombre del test del chombo se toca | **Sí**, y es RF-30.6 | Un nombre de test es documentación, y documentación que contradice la norma vigente es peor que no tenerla |

---

## 10. Nota para el plan técnico

Tres cosas que el plan tiene que resolver y que aquí solo se señalan:

1. **`?raw` y el markdown.** `src/vite-env.d.ts` referencia `vite/client`, que ya declara el módulo, así
   que typecheck lo acepta sin tocar el fichero. El plan tiene que decidir **dónde vive el markdown** y
   comprobar que `npm run build` lo incluye, no solo que los tests lo ven.
2. **La imagen pendiente.** El criterio 25 no se puede cumplir hasta que el club aporte el fichero. Si
   003 se implementa antes, ese criterio queda **bloqueado por el club**, no por el código, y hay que
   decirlo así en lugar de darlo por bueno.
3. **La imagen de la tabla y el test que lee `docs/domain.md`.** `handValue.test.ts:302` ya lee el
   documento desde el disco. Ese patrón es el que RF-28.3 replica para el markdown, y conviene que el
   plan no invente otro.