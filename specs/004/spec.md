# spec.md — 004 · La mano que se marca, el ron por ganador y la cara del salón

**Estado:** requisitos cerrados, lista para la revisión de calidad
**Alcance:** el contexto de la mano (abierta/cerrada y kan) y el desglose por ganador en multi-ron, el nombre en inglés de cada yaku, el borrado y la re-captura de un turno, y el rediseño visual de todo el aplicativo
**Continuación de:** [`../003/spec.md`](../003/spec.md), que se da por cerrada
**Reglas de puntuación:** [`../../docs/domain.md`](../../docs/domain.md)
**Especificación de estilos:** [`../../docs/especificaci_n_de_estilos_ui_ux.md`](../../docs/especificaci_n_de_estilos_ui_ux.md)
**Revisión de calidad:** [`../../docs/reviews/004-qa.md`](../../docs/reviews/004-qa.md)

---

## 0. Relación con `specs/001`, `specs/002` y `specs/003`

Esta especificación **complementa** a las tres anteriores: no reemplaza ni reescribe ninguna. Todo
requisito de 001, 002 y 003 sigue vigente salvo los que se declaran aquí.

De **002** hereda RF-22.2, RF-22.3 y RF-22.9 —el catálogo declara en qué condiciones cuenta cada yaku, la
interfaz señala el que no cuenta en vez de rechazarlo, y el ajuste a mano es un delta derivable— y los
extiende: 002 los aplicó con un contexto de mano que estaba **fijo** y con **un** desglose por turno, y
004 hace que ese contexto salga de la captura y que el desglose sea **por ganador** cuando hay más de uno.

De **002** asume también dos deudas que aquel dejó escritas y sin cerrar:

| Deuda de 002 | Por qué la asume 004 | Dónde |
| ------------ | -------------------- | ----- |
| *«no modela mano abierta ni kan»* (`specs/002/tasks.md:488`) | El contexto de la mano existía en el motor, pero la captura lo fijaba a cerrado y sin kan, así que los yaku que dependen de ello se sumaban siempre | RF-31 |
| El hueco de **0 han con riichi marcado sin declarar** (`specs/002/tasks.md:569-578`) | La corrección natural es rechazar cuando ningún yaku real cuenta, que es la lectura de RF-22.8 de 002. Queda declarada aquí y **no se aplica**: es decisión de reglas del club | §7 |

De **003** hereda el nombre en inglés, que aquella no escribió, y el método de cierre, que **cambia**:
003 cerró con `src/domain/` congelado porque era una spec de interfaz; **004 no lo es**, porque cambia el
modelo de datos y el motor. La puerta de 004 vuelve a ser la de la constitución —ver §8—.

Las dudas de §9 continúan la numeración de `specs/003/spec.md` §9.

### Lo que 004 cambia del modelo, dicho sin rodeos

A diferencia de 003 —que se declaró *«los requisitos que no cambian el modelo»*—, **004 sí cambia el
modelo de datos y el motor de reglas**. Lo hace por dos motivos, y ninguno es cosmético:

1. **El contexto de la mano no está persistido.** `TurnRecord` no tiene campo de mano abierta ni de kan;
   `HandValueInput` y `CapturedTurn` tampoco. Para que el dato sobreviva a una corrección y a una
   re-derivación (RF-18.13 de 002), tiene que viajar por toda la cadena hasta `domain/`.
2. **El desglose es por turno, y el multi-ron exige uno por ganador.** Hoy `TurnRecord` guarda **un**
   `yaku`, **un** `yakuHan`, **un** `doraCount` y **un** `fu`. En un ron con varios ganadores cada uno
   gana con **su** mano, y el motor ya lo piensa así en el cálculo (`toValue` produce un `TurnValue` por
   ganador en `domain/turn.ts`): lo que no lo piensa así es la captura.

---

## 1. Contexto y objetivo

### Contexto

`specs/001` construyó la aplicación, `specs/002` la hizo verificable y `specs/003` la hizo legible: el
estado de cada turno lo lleva el sistema, corregir un turno re-deriva los siguientes, y la mesa se ve en
la pantalla. Todo eso está comprobado por tests.

Quedan **cuatro huecos** que ninguna de las tres cerró:

1. **La captura miente sobre la mano.** `TurnForm.vue` fija `isClosedHand: true` y `hasKan: false` como
   constantes. El catálogo ya sabe que hay yaku que no cuentan abiertos —`iipeiko`, `pinfu`,
   `chiitoitsu`, `junchan`, `ryanpeikou`, `chinitsu` y casi todos los de límite, según `YakuDefinition.
   requiresClosedHand`— y el sistema los sumaría igual, porque nadie le ha dicho que la mano está
   abierta.
2. **El multi-ron no existe como tal en la captura.** Un ron con varios ganadores guarda **un** desglose
   para todos, cuando cada ganador gana con una mano distinta. El motor reparte por ganador; la captura
   los aplana en uno.
3. **Un turno mal capturado no se puede borrar desde la pantalla.** `deleteTurn` —renumeración,
   registro del borrado, excepción de bancarrota— está implementado y probado en `useGameTurns.ts:178` y
   `turns.repository.ts`, pero **ninguna pantalla lo usa**. La capacidad está pagada y no se ve: por eso
   la captura de turnos no está terminada.
4. **La cara del aplicativo.** El club tiene un documento de estilos —«Neo-Sheng / Dark Modern», que su
   propio autor titula *Fase 4*— y la aplicación no lo sigue. Se añade el nombre en inglés de cada yaku,
   que completa la legibilidad que 003 empezó.

### Objetivo

Que la mano capturada **diga lo que es** —abierta o cerrada, con kan o sin él—, que en un multi-ron
**cada ganador tenga su desglose**, que un turno mal capturado **se pueda borrar y volver a capturar**,
que cada yaku se reconozca por su nombre en inglés, y que todo el aplicativo **se vea como el salón de
Riichi moderno** que el club quiere.

En una frase: **004 termina la captura de turnos —mano, multi-ron y borrado— y le pone al aplicativo la
cara del documento de estilos.**

### Lo que 004 NO es

004 **no captura fichas**. El indicador de dora, la mano ganadora y el ura dora siguen sin capturarse: el
número de dora se sigue tecleando, como en 001. La *verificación* de la mano es una fase futura **no
determinada**, y esta especificación la deja fuera de forma explícita (§7). Lo que 004 añade al contexto
de la mano son dos hechos que el club **ya sabe al mirar la mesa** —si está abierta y si hay kan—, no una
reconstrucción del reparto.

---

## 2. Usuarios

004 **no añade usuarios**. Trabaja para los mismos tres de 002 §2, y para uno de ellos cambia lo que ve:

| Usuario | Qué le pasa en 004 |
| ------- | ------------------ |
| **Invitado** | No captura, pero lee: ve el rediseño en todo lo que ya podía leer |
| **Conductor de la sesión** | Es el que cambia: marca si la mano está abierta y si hay kan, captura el desglose de cada ganador en un multi-ron, **borra y re-captura un turno**, y busca yaku por su nombre japonés o inglés sobre la mesa rediseñada |
| **Espectador** | Ve el rediseño del marcador, del detalle de partida y de las estadísticas |

---

## 3. Historias de usuario

- **HU-26.** *Como quien captura, quiero marcar si la mano está abierta o cerrada, para que el sistema no
  sume un yaku que solo cuenta cerrado.*
- **HU-27.** *Como quien captura, quiero marcar si hubo kan en la mano, para que los yaku que lo exigen
  cuenten y los que lo rechazan no.*
- **HU-28.** *Como quien captura un ron con varios ganadores, quiero dar a cada uno su propia mano —yaku,
  fu y dora—, para que el desglose refleje lo que ganó cada uno.*
- **HU-29.** *Como quien captura, quiero poder borrar un turno mal anotado y volver a registrarlo, para no
  dejar la partida con un turno equivocado.*
- **HU-30.** *Como quien lee un yaku, quiero ver su nombre japonés con el inglés entre paréntesis, para
  reconocerlo aunque no domine la terminología.*
- **HU-31.** *Como club, quiero que la aplicación tenga el aspecto de un salón de Riichi moderno, oscuro
  y con jerarquía clara, para leerla cómodamente y sentirla propia.*
- **HU-32.** *Como quien mira un marcador en vivo, quiero números en fuente tabular que no salten al
  cambiar de cifra, para seguir la partida sin que la vista se desplace.*

---

## 4. Requisitos funcionales

Cada criterio está expresado en notación EARS: *Cuando …*, *Si …*, *Mientras …*, *Si no …* o
*El sistema …*.

### RF-31 · La mano abierta y el kan, por ganador

- **RF-31.1** Para *cada ganador de un turno con resultado de mano*, el sistema *debe permitir indicar si
  su mano es abierta o cerrada*, y *debe partir del valor cerrado como valor por defecto*, que es lo que
  hoy asume en silencio.
- **RF-31.2** Para *cada ganador de un turno con resultado de mano*, el sistema *debe permitir indicar si
  su mano tuvo kan*, y *debe partir de la ausencia de kan como valor por defecto*, que es lo que hoy
  asume en silencio.
- **RF-31.3** Si *un yaku seleccionado exige mano cerrada y el ganador se marca con mano abierta*, el
  sistema *debe señalarlo y excluirlo de la suma de ese ganador*, extendiendo RF-22.3 de 002 a un
  contexto que hasta ahora estaba fijo.
- **RF-31.4** Si *un yaku exige kan y el ganador no lo marca*, o *exige la ausencia de kan —como
  `ippatsu`— y el ganador lo marca*, el sistema *debe aplicar la condición declarada en el catálogo* en
  los dos sentidos, y *no debe* tratar el kan como si solo pudiera añadir.
- **RF-31.5** El contexto de la mano que decide qué yaku cuentan *debe salir de lo capturado en el turno*
  —`isClosedHand` y `hasKan` por ganador—, y *no debe* salir de constantes del formulario.
- **RF-31.6** Si *se corrige un turno cambiando el contexto de la mano de un ganador*, el sistema *debe
  recalcular el desglose de ese ganador* re-derivando la partida, y el `yakuHan` guardado *debe* quedar
  igual al que produce el recálculo.
- **RF-31.7** El contexto de la mano *debe formar parte de lo que el turno guarda*, de modo que un turno
  corregido o uno posterior reconstruido vuelva a contar los yaku con el mismo contexto con el que se
  capturó.

> El catálogo ya declara la condición de cada yaku (`requiresClosedHand`, `conditions`, `unmetConditions`)
> desde 002, y ya distingue `hasKan` de `noKan` (`domain/yaku.ts:185-186`). Lo que 004 arregla no es la
> regla: es que la captura nunca le dio un contexto real, y que el contexto no se guardaba. Por eso 004
> **sí escribe en `src/domain/`**, al contrario que 003.

### RF-32 · El desglose por ganador en un ron múltiple

- **RF-32.1** Si *un turno es un ron con más de un ganador*, el sistema *debe capturar y guardar, por
  cada ganador, sus **yaku**, su **han de yaku**, su **ajuste a mano**, su **número de dora** y sus
  **fu***, con el contexto de mano de RF-31.
- **RF-32.2** Si *un turno tiene un solo ganador, o es un tsumo*, el sistema *debe seguir guardando el
  desglose con la forma de siempre*, y *no debe* obligar a nadie a rellenarlo por ganador.
- **RF-32.3** El ajuste a mano de los han *debe seguir siendo un delta sobre la suma del catálogo de ese
  ganador* (RF-22.9 de 002), y *no debe* convertirse en un total absoluto al pasar a ser por ganador.
- **RF-32.4** El registro de correcciones *debe poder auditar el desglose de cada ganador por separado*,
  de modo que corregir la mano de un ganador no cuente como corregir la de los demás.
- **RF-32.5** Los turnos escritos **antes de 004** *deben seguir leyéndose con la forma de un solo
  desglose por turno*, y *no deben* migrarse ni re-derivarse a la forma por ganador.

> El motor ya piensa por ganador: `domain/turn.ts` produce **un** `TurnValue` por ganador (`toValue`,
> `turn.ts:252`), con su `han`, sus `fu` y sus puntos. Lo que no existía es que la **captura** pudiera
> alimentar a cada uno con datos distintos, porque el formulario y el documento tenían un solo juego de
> campos. QA-5 de la revisión de calidad señala exactamente esto, y lo cierra RF-32.

### RF-33 · Borrar un turno y volver a capturarlo

- **RF-33.1** Si *la partida está abierta y el turno es el **último** registrado*, el detalle de partida
  *debe ofrecer borrar ese turno*, y *debe pedir confirmación* antes de hacerlo.
- **RF-33.2** El borrado *debe usar la capacidad que ya existe* —el borrado del último turno con su
  re-derivación y la actualización de los agregados de temporada—, y *no debe* reimplementar en la
  pantalla ninguna regla que ya viva en la capa de datos o en el dominio.
- **RF-33.3** Si *el turno no es el último*, el sistema *no debe ofrecer borrarlo*, en coherencia con la
  regla que ya existe (`notLastTurn`).
- **RF-33.4** Si *el turno borrado era el que dejaba la partida marcada por bancarrota*, el sistema *debe
  levantar la marca* igual que hoy lo hace el borrado del último turno, y la pantalla *debe* reflejarlo.
- **RF-33.5** Tras *borrar el último turno*, el sistema *debe dejar la partida lista para capturar de
  nuevo ese mismo número*, porque la numeración es correlativa y sin huecos.
- **RF-33.6** Si *el recuento de turnos cambió por una captura desde otro sitio*, el borrado *debe
  rechazarse con el error que ya existe* (`staleLocal`), y la pantalla *debe* explicarlo.
- **RF-33.7** El borrado *no debe* contar para los históricos: los agregados de temporada y de jugador
  *deben* recalcularse solo con los turnos que permanecen en juego.

> RF-33 no inventa nada: `deleteTurn` (`useGameTurns.ts:178`) borra el turno, renumera los posteriores,
> anota el borrado en el registro, pide la excepción de bancarrota cuando corresponde y reescribe los
> agregados. Está probado en `useGameTurns.test.ts:716` y `turns.repository.test.ts`. Lo que falta desde
> hace tiempo es **la pantalla**, y RF-33.1 la exige.

### RF-34 · El nombre en inglés de cada yaku

- **RF-34.1** El sistema *debe mostrar cada yaku como su nombre japonés seguido de su nombre en inglés
  entre paréntesis*, y *debe hacerlo en los sitios donde el yaku se elige, se revisa o se explica*: el
  selector, las casillas de la captura, el desglose de la mano y la ayuda.
- **RF-34.2** El nombre en inglés *debe vivir en un único sitio* —el catálogo de traducciones— y *no
  debe* duplicarse ni en el catálogo de yaku de `src/domain/` ni en ningún `.vue`.
- **RF-34.3** El nombre en inglés *debe existir para **cada** yaku del catálogo*, y un test *debe
  comprobar que los cuarenta y seis* —los treinta y ocho declarados más los ocho de viento— *lo
  tienen*, de modo que añadir un yaku sin inglés rompa el test.
- **RF-34.4** El buscador de yaku *debe encontrar un yaku escribiendo parte de su nombre japonés o de su
  nombre en inglés*, y *no debe* perder las casillas ya marcadas al filtrar —RF-25.1 de 003 sigue
  vigente—.

> El nombre en inglés es **traducción**, no regla: no cambia han, ni categoría, ni condiciones. Por eso
> vive en el catálogo de i18n y no en `src/domain/yaku.ts`, que sigue siendo puro y ajeno al idioma.

### RF-35 · El rediseño transversal del aplicativo

El documento de estilos describe un sistema «Neo-Sheng / Dark Modern». Esta especificación lo adopta
para **todo el aplicativo**, no solo para las cuatro pantallas que el documento detalla.

- **RF-35.1 — Tokens.** Los colores, fuentes y sombras del documento *deben declararse como tokens del
  tema en la hoja de estilos del repositorio*, con los **nombres de token que ya existen** y solo
  cambiando sus **valores** a los del documento. El proyecto usa Tailwind CSS 4 con tokens en `@theme`
  y *no debe* introducir un fichero de configuración de Tailwind, que la versión en uso no necesita.
- **RF-35.2 — Sin colores sueltos.** Ningún componente *debe* escribir un color de la paleta fuera de los
  tokens del tema. La paleta tiene un solo dueño, y es el tema.
- **RF-35.3 — Cabecera y navegación.** El sistema *debe separar la navegación global de las acciones
  clave*, y *debe presentar las acciones de creación como botones con el color de su dominio* —verde
  para partida, azul para jugador, dorado para temporada—, según el documento §3.1.
- **RF-35.4 — Tablero de mesa.** La pantalla de captura *debe presentar a los cuatro jugadores como
  tarjetas en cuadrícula*, cada una con el nombre, el viento actual en una etiqueta de color, la
  puntuación en fuente tabular y un indicador de riichi destacado, según el documento §3.3.A.
- **RF-35.5 — Registro de turno.** El resultado del turno *debe elegirse con selectores rápidos*;
  *debe resaltarse al ganador en verde y al perdedor por ron en rojo*; el buscador de yaku *debe ser un
  campo de búsqueda con etiquetas*; y la acción de guardar *debe ser un botón destacado* que avanza al
  turno siguiente, según el documento §3.3.B.
- **RF-35.6 — Historial.** Los turnos anteriores *deben mostrarse como una línea de tiempo*, con la
  variación de puntos en color, según el documento §3.3.C. El borrado del último turno de RF-33 *debe*
  ofrecerse desde ese historial.
- **RF-35.7 — Estadísticas.** La tabla de clasificación *debe destacar las tres primeras posiciones* y
  *debe enlazar el nombre de cada jugador*; las gráficas *deben usar la paleta del tema* en vez de los
  colores nativos de la librería, según el documento §3.4.
- **RF-35.8 — Tipografía.** El sistema *debe usar la familia de texto del documento para el cuerpo y los
  títulos*, y la familia monoespaciada *para las puntuaciones y los marcadores*, de modo que las cifras
  no salten al actualizarse.
- **RF-35.9 — Alcance del rediseño.** El rediseño *debe alcanzar todas las pantallas del aplicativo*
  —ayuda, sesión, panel, partidas, detalle de partida, captura, jugadores, estadísticas, ranking y
  temporadas—, incluidas las que el documento no detalla. Las pantallas que el documento menciona son
  decisiones puntuales; el sistema de diseño es de todo el aplicativo.
- **RF-35.10 — Tema oscuro único.** El sistema *debe mantener un único tema oscuro*, como hoy; el
  documento no pide un tema claro y no se añade.
- **RF-35.11 — Sin mudar reglas a la vista.** Ninguna agregación de negocio *debe* pasar de `domain/` a un
  componente para pintarla: el rediseño consume lo que el dominio ya calcula (constitución V.1).

### RF-36 · Que el rediseño no rompa lo que ya funciona

- **RF-36.1** El rediseño *no debe perder ningún atributo de prueba ni de accesibilidad* que los tests
  existentes usen como contrato: los `data-test`, los `role`, el cierre de los modales con Escape y las
  etiquetas asociadas a sus campos *deben seguir existiendo con el mismo nombre*.
- **RF-36.2** El rediseño *no debe* cambiar el comportamiento observable de ninguna pantalla: lo que los
  tests de componente afirman sobre estado, eventos y textos *debe seguir siendo cierto*.
- **RF-36.3** El sistema *debe seguir respondiendo a pantallas desde 360 px de ancho*, sin que el
  rediseño introduzca desbordes horizontales donde antes no los había.
- **RF-36.4** La dependencia de búsqueda con etiquetas que introduce el rediseño *debe estar declarada
  en el `package.json` y con sus `peerDependencies` comprobadas contra el stack fijado*, y *debe quedar
  registrada en la enmienda de dependencias* que exige la constitución, junto a su motivo.

### RF-37 · Persistencia y compatibilidad del modelo

- **RF-37.1** El contexto de la mano y, en un ron múltiple, el desglose por ganador *deben guardarse en el
  documento del turno* y *deben poder reconstruirse al re-derivar la partida*, atravesando
  `domain/handValue.ts`, `domain/turn.ts`, `domain/replay.ts` y `data/turns.repository.ts`.
- **RF-37.2** Los campos nuevos *deben ser opcionales* en el documento, con el patrón que ya usan
  `yakuHanOverride` y `audit` para los turnos escritos antes de `specs/002`, de modo que un turno
  antiguo siga leyéndose sin migrarse.
- **RF-37.3** **Solo los turnos nuevos** usan la forma por ganador. Los turnos escritos antes de 004 *no
  deben* re-derivarse ni cambiar de puntuación.
- **RF-37.4** `rulesetVersion` *no debe* cambiar, porque los turnos antiguos no se re-puntúan: el cambio
  de forma solo afecta a lo que se captura a partir de 004.
- **RF-37.5** Un test *debe comprobar* que un turno antiguo, sin los campos nuevos, se lee y se
  re-deriva con el mismo resultado que antes de 004.

---

## 5. Requisitos no funcionales

004 hereda los ocho de `specs/002/spec.md` §5 y **no deroga ninguno**. Los que condicionan esta
especificación:

| RNF | Qué obliga aquí |
| --- | --------------- |
| **RNF-1** | El resultado de una partida no depende de quién escribió el turno. RF-31.6 y RF-32.4 lo respetan al corregir el contexto y el desglose |
| **RNF-7** | Nada puede volver a depender del número de turnos. El desglose por ganador y el borrado no introducen ninguna dependencia de la numeración salvo la renumeración que ya existe |
| **RNF-8** | El rediseño no puede filtrar datos de otros: los tokens, las fuentes y las gráficas son presentación |

Los cinco restantes siguen vigentes sin cambio. En particular **V.1**: el rediseño es de interfaz y
RF-35.11 lo blinda; ningún `.vue` pasa a hablar con Firestore, y ninguna regla de negocio se muda de
`domain/` a un componente para pintarla. Y **V.2**: el borrado y el desglose por ganador usan la caché
de `@pinia/colada`, no un store nuevo.

**Constitución IV.1 y IV.2** pasan a ser **bloqueantes** en 004 porque 004 sí escribe en `src/domain/`:
el 100 % de cobertura vuelve a morder, y toda función pura nueva —el contexto por ganador, la lectura
del desglose por ganador— exige su test en `src/__tests__/`, nombrado como el módulo.

**Constitución VI.1** sigue bloqueante: ni el rediseño ni el modelo relajan `strict`, ni introducen
`any`, ni declaran tipos sueltos para contentar a la librería de gráficas o de búsqueda.

---

## 6. Casos límite

### Sobre la mano, el kan y el multi-ron

1. **Mano abierta con un yaku que exige cerrada.** El desglose de ese ganador lo señala y no lo suma; el
   resto de yaku que sí cuentan se suman igual.
2. **Kan marcado con `rinshanKaihou`.** Cuenta. Sin kan, el mismo yaku no cuenta.
3. **Kan marcado con `ippatsu`.** No cuenta, porque `ippatsu` exige ausencia de kan. Es el lado que hoy
   no existe.
4. **Mano abierta y ningún yaku real cuenta.** Se aplica la lectura de RF-22.8 de 002: si nada cuenta, no
   hay yaku real. La decisión de rechazar o solo señalar queda en §7 y **no** la toma 004.
5. **Ron con dos ganadores y manos distintas.** Cada uno tiene sus yaku, su fu y su dora; el desglose del
   marcador muestra los dos por separado.
6. **Ron con dos ganadores y el mismo contexto.** Aunque el contexto coincida, los desgloses siguen siendo
   dos, porque uno puede tener dora y el otro no.
7. **Tsumo con varios ganadores.** No existe; el formulario no lo ofrece.
8. **Turno corregido para cerrar una mano que se había capturado abierta.** El desglose se recalcula con
   el contexto nuevo y el `yakuHan` guardado coincide con el recálculo.
9. **Mano cerrada sin kan, con los valores por defecto.** Se comporta exactamente como antes de 004.
10. **Turno escrito antes de 004.** Se lee con un solo desglose por turno, sin migrarse ni re-puntuarse.

### Sobre el borrado y la re-captura

11. **Borrar el último turno.** Se pide confirmación; al aceptar, el turno desaparece y la pantalla queda
    lista para capturar de nuevo ese número.
12. **Intentar borrar un turno que no es el último.** La opción no se ofrece.
13. **Borrar el último turno de una partida marcada por bancarrota.** La marca se levanta.
14. **Borrar cuando otro capturó desde otro sitio.** Se rechaza con `staleLocal` y la pantalla lo
    explica.
15. **Borrar un turno y mirar los históricos.** El turno borrado no cuenta; los agregados reflejan solo
    los turnos que permanecen.

### Sobre los nombres de yaku

16. **Un yaku recién añadido al catálogo sin nombre en inglés.** El test de RF-34.3 falla y lo nombra.
17. **Búsqueda por nombre inglés.** Escribir «twice pure double sequence» encuentra el `ryanpeikou`.
18. **Búsqueda sin coincidencia.** El filtro queda vacío sin perder las casillas ya marcadas.

### Sobre el rediseño

19. **Pantalla de 360 px.** El tablero de la mesa y la cabecera se reorganizan sin desbordar a lo ancho.
20. **Tabla densa.** La lista de yaku mantiene su búsqueda y sus casillas al cambiar de estilo.
21. **Modal abierto.** El rediseño no rompe el `role="dialog"` ni el cierre con Escape.
22. **Cifra que cambia en el marcador.** La fuente tabular evita el salto visual.
23. **Yaku de límite.** Se pinta con su categoría y su nombre en inglés, igual que un yaku normal.

---

## 7. Fuera de alcance

### Vetado explícitamente en esta etapa

- **Exportar e importar datos.** No habrá descarga de información ni carga masiva. Sigue vetado.
- **Notificaciones y recordatorios.** No se enviarán avisos por ningún medio. Sigue vetado.

### Decidido para futuras especificaciones

- **La captura de la mano ganadora.** El indicador de dora, el ura dora, el akadora y las fichas de la
  mano **no se capturan en 004**. El número de dora se sigue tecleando, como en 001, y la verificación
  total de la mano es una fase **futura no determinada**. 004 solo marca lo que el club ve en la mesa:
  si está abierta y si hay kan.
- **005 · Reglaset M.League.** `ruleset: 'mleague'` existe en el modelo y no admite captura.
- **Puntuación por mano (rating o ELO).**
- **El final de una ronda.** RF-18.21 de 002 lo declara no modelado, y 004 no lo modela.
- **La captura sin conexión comprobada por test.** El experimento de
  [`../../docs/reviews/002-red.md`](../../docs/reviews/002-red.md) concluyó que `happy-dom` no expone
  `indexedDB`, que no hay emulador y que el test saldría **a internet**. 004 **no la reabre**. Reabrirla
  seguiría exigiendo las mismas tres cosas: emulador, `IndexedDB` real y `fetch` bloqueado.
- **La corrección del hueco de 0 han con riichi marcado sin declarar**
  (`specs/002/tasks.md:569-578`). La corrección natural —rechazar cuando ningún yaku real cuenta— cambia
  turnos que hoy se guardan y es **decisión de reglas del club**, no de código. Queda declarada aquí
  para decidirla, y 004 **no la aplica**.
- **Borrar un turno que no sea el último.** La interfaz solo ofrece borrar el último (RF-33.1). La
  capacidad de borrar un intermedio con renumeración existe en la capa de datos, pero **no se expone** en
  esta especificación; si se pide, vuelve aquí.
- **La migración de turnos antiguos a la forma por ganador.** Los turnos escritos antes de 004 no se
  migran (RF-37.3).

### Fuera de alcance por definición de esta especificación

- **Cualquier cálculo de puntuación nuevo.** La suma de han, los fu, la banda y el valor de la mesa
  siguen siendo los de 001 y 002: 004 cambia **de dónde salen los datos** y **cuántos desgloses hay por
  turno**, no cómo se puntúa.
- **Reglas de seguridad nuevas.** El borrado y el desglose por ganador usan los documentos y las
  escrituras que ya existen.

---

## 8. Criterios de finalización

La especificación se considera cumplida cuando **todas** estas condiciones se cumplen. Cada una es
comprobable por un test o por una medición, no por lectura del código.

### Sobre la mano, el kan y el multi-ron

14. Marcar la mano como abierta hace que un yaku que exige cerrada se señale y no se sume, y un test lo
    fija con un yaku concreto del catálogo.
15. Marcar kan hace que un yaku que lo exige cuente; no marcarlo hace que no cuente; y marcar kan **quita**
    un yaku que exige su ausencia (`ippatsu`).
16. El contexto de la mano sale de lo capturado, y un test afirma que los valores por defecto mantienen
    el comportamiento anterior a 004.
17. Corregir el contexto de un turno recalcula el desglose y el `yakuHan` guardado coincide con el
    recálculo.
18. Un ron con dos ganadores guarda dos desgloses independientes, con su propio yaku, fu y dora, y el
    motor los reparte como ya sabe hacerlo.
19. Un turno con un solo ganador conserva la forma de siempre.

### Sobre el borrado y la re-captura

20. El detalle de partida ofrece borrar el **último** turno con confirmación, y **no** ofrece borrar un
    turno intermedio.
21. Tras borrar, la partida queda lista para capturar de nuevo ese número.
22. Borrar el último turno de una partida marcada levanta la marca.
23. Un borrado con recuento desfasado se rechaza con `staleLocal`.
24. Los agregados de temporada no cuentan el turno borrado.

### Sobre los nombres de yaku

25. Cada yaku del catálogo tiene nombre en inglés, y un test que enumera los **cuarenta y seis** falla si
    alguno falta.
26. El nombre en inglés no está en `src/domain/yaku.ts` ni en ningún `.vue`, y un test lo comprueba.
27. El buscador de yaku encuentra por nombre japonés y por nombre inglés sin perder las casillas
    marcadas.

### Sobre el modelo y la compatibilidad

28. Un turno escrito antes de 004, sin los campos nuevos, se lee y se re-deriva con el mismo resultado
    que daba antes de 004.
29. Los campos nuevos son opcionales en el documento y no obligan a migrar nada.
30. `rulesetVersion` no cambia.

### Sobre el rediseño

31. Los tokens del tema tienen los valores del documento de estilos, con los nombres de token que ya
    existían, y no hay ningún fichero de configuración de Tailwind en el repositorio.
32. Ningún componente escribe un color de la paleta fuera de los tokens del tema, y una búsqueda lo
    comprueba.
33. La cabecera, el tablero de mesa, el registro de turno, el historial y las estadísticas siguen las
    decisiones del documento de estilos.
34. Las puntuaciones y los marcadores se renderizan en la fuente monoespaciada del tema.
35. **Ningún `data-test`, `role`, etiqueta ni atajo de accesibilidad existente ha desaparecido o
    cambiado de nombre**, y la suite entera sigue verde.
36. El rediseño alcanza todas las pantallas del aplicativo, incluidas las que el documento no detalla.
37. El sistema responde a partir de 360 px de ancho sin desbordes nuevos.

### Sobre el método

38. **`src/domain/` ha cambiado de forma declarada** —por el contexto de la mano y el desglose por
    ganador—, y `git diff` muestra los cambios esperados y **ninguno fuera** de lo que declara §0.
39. La cobertura de `src/domain/` sigue en el **100 %**, y toda función pura nueva tiene su test.
40. Cada comportamiento de pantalla de §4 tiene al menos un test de componente.
41. La dependencia de búsqueda con etiquetas está declarada en `package.json`, con sus `peerDependencies`
    comprobadas, y su enmienda está escrita junto a su motivo.
42. `typecheck`, `lint`, `test` y `format:check` pasan en ese orden.

---

## 9. Dudas resueltas

| # | Duda | Decisión | Consecuencia asumida |
| - | ---- | -------- | --------------------- |
| 1 | Si 004 captura la mano ganadora y el dora | **No.** Solo se marca abierta/cerrada y kan por ganador; el dora se sigue tecleando | La verificación total de la mano queda para una fase futura no determinada, y aquí se declara fuera de alcance |
| 2 | Si se migran los tokens del tema o se añaden alias | **Se migran**, manteniendo los nombres de token y cambiando solo sus valores | El aspecto cambia en todo el aplicativo de una vez; como no hay colores sueltos en los componentes, la migración es mecánica |
| 3 | De dónde sale la dependencia de búsqueda con etiquetas | Es **dependencia nueva** y se instala | Obliga a la enmienda de dependencias de la constitución, con su motivo escrito |
| 4 | Si el rediseño se limita a las cuatro pantallas del documento | **No.** Alcanza todo el aplicativo | Las pantallas del documento son decisiones puntuales; el sistema de diseño es transversal |
| 5 | Si 004 cambia `src/domain/` | **Sí.** El contexto de la mano no estaba persistido y el desglose era por turno; ambos exigen tocar el motor y el modelo | La puerta de cierre **deja de ser** la de 003: vuelve a ser la de la constitución (100 % de `domain/`) con `git diff` **con** cambios |
| 6 | Si la migración de tokens conserva los nombres actuales | **Sí.** Solo cambian los valores | Menor riesgo y menos ruido en el diff: los componentes no se renombran, solo se ven distintos |
| 7 | Qué familias tipográficas y cómo se incorporan | Las del documento, **autoalojadas** para no depender de una llamada externa en cada carga | Es la opción de mejor rendimiento y sin coste; hay que declarar el modo de inclusión en el plan |
| 8 | Si se aplica la corrección del hueco de 0 han | **No.** Se declara y se deja para una decisión de reglas del club | Es un cambio de reglas, no de interfaz, y 004 no lo mete por la puerta de atrás |
| 9 | Cómo se cierra la puerta si el rediseño es visual | Un test por comportamiento de pantalla más la revisión visual declarada para lo puramente estético, como en 003 | El guardián de trazabilidad que lee los RF se parametriza a `specs/004` |
| 10 | Cómo se modela el ron con varios ganadores | **Por ganador: yaku, han, ajuste, dora, fu y contexto, solo cuando el ron tiene más de un ganador** | Toca el documento del turno y el motor; los turnos de un solo ganador y los tsumos conservan la forma de siempre |
| 11 | Si `doraCount` y `fu` son por ganador | **Sí**, en el ron múltiple | Sin esto, un multi-ron con distinta dora por ganador no se podría representar |
| 12 | Si el ajuste a mano (`yakuHanOverride`) es por ganador | **Sí**, en el ron múltiple, y sigue siendo un delta de ese ganador | Conserva RF-22.9 de 002: el total sigue siendo derivable de la suma más el ajuste |
| 13 | Si se migran los turnos antiguos a la forma por ganador | **No.** Solo los turnos nuevos usan la forma por ganador | Los campos nuevos son opcionales; un test fija que un turno antiguo se lee igual que antes |
| 14 | Si `rulesetVersion` sube | **No** | Los turnos antiguos no se re-puntúan, así que no hay nada que versionar distinto |
| 15 | Hasta dónde llega el borrado | **Solo el último turno**, con confirmación, desde el detalle de partida | La renumeración de un intermedio existe en la capa de datos pero no se expone; si se pide, vuelve aquí |
| 16 | De dónde sale el borrado | De la capacidad que **ya existe** (`deleteTurn`), más la pantalla que faltaba | No se reimplementa ninguna regla en el componente: constitución V.1 |
| 17 | Qué pasa con los históricos al borrar | El turno borrado **no** cuenta: los agregados se recalculan con los turnos que permanecen | Es lo que ya hace la reescritura de agregados de temporada del borrado |
| 18 | Dónde vive el nombre en inglés | En el catálogo de traducciones (i18n), ampliando el grupo `yaku.*` que ya tiene los 46 nombres | El catálogo de `domain/` sigue puro y ajeno al idioma |
| 19 | Si la comprobación de nombres de yaku de `locales.test.ts` se reemplaza | **Se amplía** a los 46 ids del catálogo, en vez de mantener una lista parcial en paralelo | Una sola fuente de verdad del invariante; no dos tests sobre lo mismo |

---

## 10. Nota para el plan técnico

Seis cosas que el plan tiene que resolver y que aquí solo se señalan:

1. **La cadena del contexto de la mano.** El plan tiene que llevar el contexto (`isClosedHand`, `hasKan`)
   y, en ron múltiple, el desglose por ganador desde el formulario hasta `domain/handValue.ts`,
   `domain/turn.ts`, `domain/replay.ts` (`CapturedTurn`) y `data/turns.repository.ts` (`TurnRecord`,
   `CreateTurnInput`, `UpdateTurnPatch`, `TURN_PATCH_FIELDS`, `TurnAuditChange`, `capturedFieldsBefore`),
   sin duplicar el cálculo y sin que el contexto capturado entre en los campos **derivados**.
2. **La forma por ganador y su compatibilidad.** El plan tiene que decidir cómo convive la forma por
   ganador con la forma histórica de un solo desglose en el mismo campo, con la lectura opcional que ya
   usan `yakuHanOverride` y `audit`, y probar que un turno antiguo se re-deriva igual.
3. **La auditoría del borrado y del desglose por ganador.** El plan tiene que decidir cómo se audita
   «el yaku del ganador B» sin romper `TURN_PATCH_FIELDS` ni el diff de `capturedFieldsBefore`.
4. **El borrado en la pantalla.** El plan tiene que conectar `deleteTurn` al detalle de partida con un
   modal de confirmación, respetando la regla del último turno, la excepción de bancarrota y `staleLocal`,
   y sin reimplementar nada de la capa de datos.
5. **La migración de tokens en Tailwind 4.** Los valores viven en `@theme` en la hoja de estilos del
   repositorio. El plan tiene que mover los valores a los del documento **sin** crear un fichero de
   configuración y **sin** renombrar los tokens, y comprobar que ninguna utilidad se queda apuntando a un
   color que ya no existe. Las familias tipográficas se autoalojan.
6. **La librería de búsqueda con etiquetas.** El plan tiene que elegirla, verificar sus `peerDependencies`
   contra las versiones fijadas por la constitución, y decidir si sustituye al selector de yaku actual o
   lo envuelve, manteniendo el filtrado y las casillas de 003 (RF-34.4).
