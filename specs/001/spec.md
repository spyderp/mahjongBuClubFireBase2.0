# spec.md — 001 · Registro de partidas y motores de cálculo

**Estado:** requisitos cerrados, lista para el plan técnico
**Alcance:** primera versión utilizable del club (MVP)
**Reglas de puntuación:** [`../../docs/domain.md`](../../docs/domain.md)

---

## 1. Contexto y objetivo

### Contexto

Un club de Mahjong Riichi juega partidas en reuniones semanales. Hoy el resultado de cada partida
queda anotado en cuadernos, mensajes o simplemente en la memoria del grupo. Eso produce tres
problemas concretos:

- **No hay histórico consultable.** Para saber cómo va un jugador en la temporada hay que repasar
  las partidas una a una.
- **El cálculo se reparte.** Una misma partida acaba puntuándose de formas distintas según quién la
  recounta, porque el reglamento tiene pasos que se olvidan: el valor de cada mano, las fichas de
  riichi, el reparto cuando varios ganan a la vez, la penalización por abandono.
- **Las estadísticas no se pueden comparar.** Sin un criterio único, ninguna cifra sirve para
  ordenar a los jugadores ni para detectar una racha.

### Objetivo

Dotar al club de un registro único y verificable de sus partidas, y de un motor de cálculo que
aplique siempre las mismas reglas. El objetivo **no** es digitalizar el juego ni sustituir las
mesas: es que la regla se aplique una sola vez, de forma idéntica para todos, y que el resultado sea
auditable turno a turno.

Un segundo objetivo, igual de importante: que la captura ocurra **mientras se juega**. Si el registro
se rellena después, con cuatro personas recordando lo ocurrido, el dato ya está perdido antes de
escribirlo.

### Por qué se decide así

- **Se guarda la mano en cifras, no en fichas.** El sistema calcula el valor de cada mano, así que
  hay que capturar sus yaku, su fu y su recuento de dora, pero no las 14 fichas. Guardar las fichas
  es lo que permitiría auditar el cálculo desde cero, y multiplica el esfuerzo de captura en la
  mesa. Queda registrado como siguiente paso. El punto ciego que introduce esta decisión es que el
  recuento de dora lo pone quien captura y no es verificable: una mano con ura dora mal contada se
  puntúa mal sin que nada lo detecte.
- **Una partida se puede dejar sin terminar.** En una mesa real alguien se va, o el club acaba la
  noche. Obligar a cerrar la partida habría producido datos inventados para no perder el registro.

---

## 2. Usuarios

| Usuario | Descripción | Qué puede hacer |
| --- | --- | --- |
| **Visitante** | Cualquiera que abra la aplicación sin cuenta. No necesita registrarse. | Consultar resultados de partidas, estadísticas de jugador y ranking de temporada |
| **Usuario con cuenta** | Quien inicia sesión. Captura la información y administra el club. | Todo lo del visitante, y además: crear y capturar partidas, corregirlas mientras están abiertas, finalizarlas, dar de alta y baja jugadores, crear y cerrar temporadas, borrar jugadores y temporadas |
| **Jugador invitado** | Persona que participa en una partida pero no tiene cuenta y no pertenece al club. Existe solo dentro de esa partida. | Nada directamente: su identificador basta para que aparezca en el resultado |

### Nota sobre la gestión de cuentas

La aplicación **no gestiona las cuentas de usuario**: quién entra al club se administra por fuera del
sistema. La aplicación comprueba que haya una sesión iniciada para permitir la captura, y la mantiene
abierta entre visitas.

### Nota sobre permisos

No hay niveles de permiso dentro de la aplicación. **Cualquier usuario que inicie sesión puede
capturar, corregir y administrar todo, incluido borrar jugadores y temporadas.** No se distinguen
perfil de administrador, de editor ni de simple lector autenticado. El control de quién tiene cuenta
se resuelve fuera del sistema.

---

## 3. Historias de usuario

**HU-1.** Como *usuario con cuenta*, quiero *crear una partida y registrar quién juega* para que *el
historial del club empiece a construirse desde la propia mesa*.

**HU-2.** Como *usuario con cuenta*, quiero *anotar cada turno mientras se juega* para que *no dependa
de la memoria de cuatro personas al día siguiente*.

**HU-3.** Como *usuario con cuenta*, quiero *corregir un turno equivocado mientras la partida sigue
abierta* para que *un error de captura no contamine la temporada entera*.

**HU-4.** Como *usuario con cuenta*, quiero *que el sistema calcule el valor de cada mano, las
posiciones, el uma y las fichas de riichi* para que *no tenga que recontar la partida y no se apliquen
reglas distintas cada vez*.

**HU-5.** Como *usuario con cuenta*, quiero *finalizar la partida cuando acaba* para que *sus datos
entren en las estadísticas de la temporada*.

**HU-6.** Como *usuario con cuenta*, quiero *abrir y cerrar temporadas* para que *las estadísticas
se puedan comparar entre periodos con la misma cantidad de partidas*.

**HU-7.** Como *usuario con cuenta*, quiero *ver las estadísticas y el ranking de cada jugador* para
que *sepas quién va mejor y quién no*.

**HU-8.** Como *visitante*, quiero *ver los resultados y el ranking sin crearme una cuenta* para que
*pueda seguir el devenir del club sin que le pongas ninguna traba*.

**HU-9.** Como *usuario con cuenta*, quiero *ver la evolución de mis partidas en una gráfica* para que
*se entienda de un vistazo si estoy mejorando o no*.

---

## 4. Requisitos funcionales

Cada criterio de aceptación está expresado en notación EARS: *Cuando …*, *Si …*, *Mientras …*, *Si
no …* o *El sistema …*.

---

### RF-0 · Estados y ciclo de vida

Los estados son parte del modelo y condicionan casi todos los requisitos siguientes. No son una
decisión de interfaz.

**Estados de partida**

| Estado            | Se alcanza cuando                                                       | Computa             | Admite turnos |
| ----------------- | ----------------------------------------------------------------------- | ------------------- | ------------- |
| `abierta`         | Al crearla                                                              | No                  | Sí            |
| `finalizada`      | Se finaliza de forma explícita, o al quedar alguien por debajo de 0      | Sí                  | No            |
| `inconclusa`      | Se abandona tras más de 7 días sin actividad                            | No                  | No            |
| `abortada`        | Se intenta finalizar por debajo del mínimo de turnos del modo de partida | No                  | No            |

- **RF-0.1** El sistema *debe representar una partida en uno de los cuatro estados* `abierta`,
  `finalizada`, `inconclusa` o `abortada`, y *no debe permitir la captura de turnos en ningún estado
  distinto de `abierta`*.
- **RF-0.2** Si *una partida queda `finalizada`*, el sistema *debe hacerla inmutable* y *debe lanzar su
  resultado a las estadísticas y al ranking de la temporada a la que pertenece*.
- **RF-0.3** El sistema *no debe ofrecer ninguna transición de salida a los estados `inconclusa` y
  `abortada`*: ambos son terminales. Una partida en cualquiera de los dos *debe conservar sus turnos
  visibles* y *no debe computar en ningún agregado*.
- **RF-0.4** Si *una partida abierta tiene a algún jugador por debajo de 0*, el sistema *debe
  marcarla como pendiente de cierre*, y en ese estado *debe permitir únicamente la acción de
  finalizar*, además del registro de auditorías.

**Estados de temporada**

- **RF-0.5** El sistema *debe representar una temporada como abierta o cerrada*, y *no debe permitir
  añadir a una temporada cerrada partidas cuya fecha caiga dentro de su rango*.
- **RF-0.6** El sistema *no debe permitir modificar el rango de fechas de una temporada cerrada*.

**Jugadores**

- **RF-0.7** El sistema *debe representar a un jugador como activo o dado de baja*, y *debe permitir
  capturar los turnos de un jugador dado de baja que participe en una partida abierta*.

> **Por qué:** sin una máquina de estados explícita, cada requisito tiene que reinventar qué puede
> hacer una partida. La regla del banco de pruebas de §6 se apoya en ella para no inventar casos.

---

### RF-1 · Alta de jugadores del club y de invitados

El club necesita identificar a las personas que participan, y debe admitir a quienes no pertenecen
a él.

- **RF-1.1** El sistema *debe permitir dar de alta a un jugador del club con su nombre y el
  identificador que le corresponde*.
- **RF-1.2** Si *se da de alta a un jugador con un identificador o un nombre que ya existe en el
  club*, el sistema *debe avisar de la coincidencia y pedir confirmación* antes de crear un
  duplicado.
- **RF-1.3** El sistema *debe permitir capturar un identificador que no corresponde a ningún jugador
  del club* en el momento de crear una partida, creando un **jugador invitado** que solo existe en esa
  partida.
- **RF-1.4** Si *se captura un identificador que ya corresponde a un invitado de una partida
  anterior*, el sistema *debe reconocerlo como la misma persona*, de modo que *sus estadísticas se
  acumulen en lugar de empezar de cero*.
- **RF-1.5** Si *se ofrece promover a un invitado a jugador del club*, el sistema *debe conservar
  todo su historial bajo la misma identidad* y *no debe crear una identidad nueva*.
- **RF-1.6** El sistema *debe permitir dar de baja a un jugador del club*, conservando sus partidas
  históricas.
- **RF-1.7** Si *un jugador con estadísticas en temporadas anteriores se da de baja*, el sistema *debe
  conservar sus datos históricos y no reasignarlos a nadie*.
- **RF-1.8** El sistema *debe rechazar* un nombre vacío tras recortar, de más de 100 caracteres, o un
  identificador que no cumpla el formato de RF-1.9, *explicando cuál de las tres condiciones falla*.
- **RF-1.9** El sistema *debe recortar y pasar el identificador a minúsculas antes de validarlo y de
  guardarlo*, de modo que *dos escrituras que solo difieren en mayúsculas o en espacios se reconozcan
  como la misma persona*, y *debe aceptar como válido solo uno de dos formatos*:
  - **Código** — de 2 a 12 caracteres, solo letras y dígitos.
  - **Alias** — de 2 a 32 caracteres, de letras, dígitos, guion y guion bajo, que *no puede empezar ni
    terminar por un guion o un guion bajo*.
- **RF-1.10** Si *un identificador no cumple ninguno de los dos formatos de RF-1.9*, el sistema *debe
  rechazarlo indicando la causa*: está vacío, es demasiado corto, es demasiado largo o tiene caracteres
  no admitidos.

> **Por qué:** el club recibe invitados y no todos se registran. El identificador es lo que permite
> que las estadísticas de un invitado que vuelve se acumulen en lugar de empezar de cero, y es
> también lo que impide que dos personas distintas se fusionen solo por llamarse igual. El formato es
> estrecho a propósito y la normalización a minúsculas no es cosmetic: **`SOC-001` y `soc-001` tienen
> que ser la misma persona**. Si no se normalizan, un identificador tecleado con mayúsculas distintas
> crea un jugador nuevo, reparte su historial en dos y no hay ninguna validación posterior que lo
> detecte. El club mantiene la lista de identificadores **fuera del sistema** (§9, duda 25); lo único
> que hace el club es escribirlo igual cada vez.

---

### RF-2 · Creación de una partida

Cada partida debe quedar identificada, con sus participantes, con su longitud y con su fecha.

- **RF-2.1** Cuando *un usuario con cuenta registra una partida*, el sistema *debe permitir indicar
  los cuatro participantes y el asiento de cada uno*.
- **RF-2.2** Si *se intenta crear una partida con menos o más de cuatro jugadores distintos*, el
  sistema *debe rechazarla e indicar el número de participantes esperado*.
- **RF-2.3** Si *uno de los cuatro participantes no está dado de alta*, el sistema *debe permitir
  crear la partida registréndolo como jugador invitado*.
- **RF-2.4** El sistema *debe registrar en toda partida el sistema de reglas aplicado*, hoy y por
  defecto **Mahjong Souls**.
- **RF-2.5** Si *el sistema de reglas no está soportado para el cálculo*, el sistema *debe impedir
  capturar turnos de esa partida* en lugar de calcular con reglas equivocadas.
- **RF-2.6** El sistema *debe exigir la longitud de la partida* —`tonpuusen` o `hanchan`—, porque de
  ella depende el mínimo de turnos sin el cual la partida no puede finalizarse.
- **RF-2.7** El sistema *debe exigir la fecha de la partida*, porque de ella se deduce su temporada.
- **RF-2.8** Si *algún asiento está repetido o no corresponde a Este, Sur, Oeste o Norte*, el sistema
  *debe rechazar la partida indicando los asientos válidos*.
- **RF-2.9** Si *un jugador ya participa en otra partida abierta*, el sistema *debe permitir
  añadirlo igualmente*: puede jugar dos partidas abiertas a la vez.

> **Por qué:** el número de participantes es una regla del juego, no una preferencia. Registrar el
> reglamento en la partida, aunque hoy solo haya uno disponible, evita tener que adivinar a qué
> reglas se calculó un histórico pasado el día que se añada un segundo reglamento.

---

### RF-3 · Captura de un turno en vivo

Es el requisito central: el registro se rellena mientras se juega, turno a turno.

- **RF-3.1** El sistema *debe permitir registrar un turno indicando su número dentro de la partida*.
- **RF-3.2** Si *se intenta registrar un turno cuyo número anterior no existe*, el sistema *debe
  rechazarlo*: la numeración es correlativa y sin huecos.
- **RF-3.3** Para *cada turno registrado*, el sistema *debe calcular los puntos que mueve cada
  jugador* a partir de la mano, **no permitir que se tecleen**.
- **RF-3.4** Para *cada turno registrado*, el sistema *debe almacenar qué yaku se han hecho y qué
  jugador las ha obtenido*, para que *las estadísticas de yaku por jugador sean posibles*.
- **RF-3.5** Para *cada turno registrado*, el sistema *debe almacenar cuántas fichas de riichi hay en
  el bote al terminar ese turno*.
- **RF-3.6** Para *cada turno registrado*, el sistema *debe almacenar quién ha declarado riichi en
  ese turno*.
- **RF-3.7** Para *cada turno registrado*, el sistema *debe almacenar qué usuario lo ha registrado*.
- **RF-3.8** Si *se intenta registrar un turno con el mismo número que uno ya guardado*, el sistema
  *debe rechazarlo en lugar de sobrescribirlo*.
- **RF-3.9** El sistema *debe permitir corregir un turno ya guardado mientras la partida siga
  abierta*, y *debe volver a calcular el marcador y las estadísticas con el turno corregido*.
- **RF-3.10** Si *alguien está corrigiendo un turno y no lo confirma*, el sistema *debe permitir
  abandonar la captura sin guardar nada*.
- **RF-3.11** Cuando *se confirma un turno*, el sistema *debe mostrar el marcador acumulado de los
  cuatro jugadores*.
- **RF-3.12** Para *cada turno*, el sistema *debe exigir el tipo de resultado*: `tsumo`, `ron`,
  `ryuukyoku` o `chombo`.
- **RF-3.13** Para *cada turno con resultado de mano*, el sistema *debe exigir los yaku, el número
  de han de yaku, el número de dora, el fu y el contador de honba*, así como *el asiento de la
  localía*.
- **RF-3.14** Para *cada turno con empate o prórroga*, el sistema *debe exigir qué jugadores tienen
  tenpai*.

> **Por qué:** sin esto no hay histórico. Guardar el reparto de riichi en cada turno, en lugar de
> solo al final, es lo que permite saber que una partida se contabilizó bien: cada ficha queda
> asociada al momento en que estaba sobre la mesa. Corregir un turno guardado es una operación
> distinta de registrar uno, y por eso tiene su propio requisito: registrar nunca sobrescribe.

---

### RF-4 · Validación de coherencia de un turno

Un dato falso en el historial es peor que un dato ausente, porque no se puede detectar leyendo.

- **RF-4.1** Para *cada turno registrado*, el sistema *debe comprobar que la suma de sus deltas
  cumple*:

  ```
  Σ deltas = −(1000 × nº de riichi declarados) − (8000 × nº de chombos)
  ```

  y *debe rechazarla explicando la discrepancia si no se cumple*. La suma **no** es cero por
  construcción: ni las fichas de riichi ni el chombo van a ningún jugador.

- **RF-4.2** Si *un turno se registra sin tipo de resultado*, el sistema *debe impedir que se
  guarde*.
- **RF-4.3** Si *un turno se registra con yakuHan en cero*, el sistema *debe rechazarlo*: los dora
  no sustituyen a un yaku.
- **RF-4.4** Si *una combinación de han y fu no es representable en la tabla de puntuación*, el
  sistema *debe rechazarla*. Las combinaciones no representables son los 20 fu por ron —solo
  existen por pinfu, que exige tsumo— y los 25 fu por tsumo sin menzen tsumo.
- **RF-4.5** Si *los yaku de viento declarados superan a los que el asiento del jugador y el viento
  de la ronda permiten*, el sistema *debe rechazarlos*.
- **RF-4.6** Si *una mano se declara con 25 fu y no incluye chiitoitsu, o con chiitoitsu y fu
  distintos de 25*, el sistema *debe rechazarla*.
- **RF-4.7** Si *tras aplicar los puntos de un turno algún jugador quedaría por debajo de cero*, el
  sistema *debe avisar de que la partida ha terminado* para que la finalice.
- **RF-4.8** El sistema *debe advertir de los yaku imposibles que no puede detectar* —porque no
  guarda las fichas de la mano— *y no debe prometer una cobertura que no tiene*.

> **Por qué:** el ciclo de vida de una partida es largo y quien captura puede despistarse. Detectar
> en el momento los turnos que no cuadran es lo que separa un historial fiable de uno que exige
> recontar a mano cada temporada. Los controles de yaku se limitan a los que se pueden verificar sin
> la mano: una lista de comprobación explícita es mejor que una promesa que no se puede cumplir.

---

### RF-5 · Fichas de riichi

Las fichas de riichi son el punto donde más se discrepan los recuentos manuales.

- **RF-5.1** El sistema *debe permitir declarar que un jugador ha declarado riichi durante un turno*:
  resta 1000 al declarante y suma 1000 al bote de mesa, **fuera de los deltas de los jugadores**.
- **RF-5.2** El sistema *debe mantener la cantidad de fichas del bote de mesa* a lo largo de los
  turnos de la partida.
- **RF-5.3** Si *un turno termina con tsumo o ron*, el sistema *debe adjudicar al jugador que gana la
  mano la totalidad del bote*, como un único monto.
- **RF-5.4** Si *varios jugadores ganan a la vez*, el sistema *debe adjudicar el bote al ganador cuya
  mano vale más*, y si dos valen lo mismo *al de menor asiento*.
- **RF-5.5** Si *un turno termina en empate*, el sistema *no debe adjudicar las fichas de riichi*,
  que permanecen en el bote para el turno siguiente.
- **RF-5.6** El sistema *debe permitir consultar, en cualquier momento, cuántas fichas de riichi hay
  en el bote y quién las ha declaradas*.
- **RF-5.7** Si *una partida queda inconclusa o abortada con fichas sin reclamar*, el sistema *debe
  conservar el registro del bote y no debe adjudicarlo a nadie*: esos 1000 puntos se pierden.

> **Por qué:** el reparto de fichas de riichi es la diferencia más frecuente entre dos recuentos
> del mismo resultado. Fijarlo en el sistema elimina de raíz esa discrepancia.

---

### RF-6 · Múltiple ron y suufon renta

Cuando varios jugadores ganan a la vez contra la misma mano.

- **RF-6.1** El sistema *debe permitir registrar que en un mismo turno ganan dos o tres jugadores
  por ron*.
- **RF-6.2** Si *ganan varios jugadores en el mismo turno por ron*, el sistema *debe asignar a cada
  ganador el valor íntegro de su propia mano*.
- **RF-6.3** Si *ganan varios jugadores en el mismo turno por ron*, el sistema *debe cargar al
  jugador que descartó la suma de los valores de todas las manos ganadoras*.
- **RF-6.4** Si *un turno registra un ron por parte de más de tres jugadores*, el sistema *debe
  rechazarlo*, por ser imposible en el juego.
- **RF-6.5** Si *ganan los cuatro jugadores en el mismo turno por tsumo* (`suufon renta`), el
  sistema *debe registrar un tsumo normal con cuatro ganadores*, cobrando cada uno su mano con los
  multiplicadores de tsumo y adjudicando el bote al ganador de mayor valor.

> **Por qué:** en un múltiple ron es habitual repartir el pago, lo que reduce el impacto de la mano
> más cara. Este club aplica el criterio contrario, que es el del reglamento de referencia: cada
> ganador cobra su mano completa y el descartador asume la suma.

---

### RF-7 · Chombo: penalización por abandono

- **RF-7.1** El sistema *debe permitir registrar un abandono (chombo) de un jugador durante un
  turno*.
- **RF-7.2** Si *se registra un chombo*, el sistema *debe asignar un delta de −8000 al jugador que
  abandonó en ese mismo turno*, sin saldo a favor de ningún otro jugador.
- **RF-7.3** Si *se registra un chombo*, el sistema ***no debe interrumpir la partida***: los turnos
  siguientes se siguen capturando con normalidad.
- **RF-7.4** Si *una partida contiene un chombo*, el sistema *debe calcularla y finalizarla con
  normalidad*, y *debe registrar el abandono en `results[].chombo` y en las estadísticas de chombo del
  jugador*.
- **RF-7.5** Si *una partida contiene un chombo*, el sistema *debe documentar que su suma de
  marcadores es 92 000 y no 100 000*.

> **Por qué:** el chombo es la única sanción del reglamento y no consiste en puntos de la mano, sino
> en una penalización directa. Se aplica sobre el turno en el que ocurre para que la traza turno a
> turno muestre el castigo, y **no** interrumpe la partida: interrumpirla perdería los resultados de
> una partida que se ha jugado entera.

---

### RF-8 · Cálculo del resultado final de la partida

Al finalizar, el sistema debe producir un resultado único y completo.

- **RF-8.1** Si *una partida se finaliza*, el sistema *debe calcular la puntuación final de cada uno
  de los cuatro jugadores*, partiendo de 25 000 puntos.
- **RF-8.2** Si *una partida se finaliza*, el sistema *debe determinar la posición final de cada
  jugador*, ordenando por puntuación final.
- **RF-8.3** Si *dos o más jugadores terminan con la misma puntuación*, el sistema *debe desempatar
  por asiento, de Este a Norte*, y *debe documentarlo junto al resultado*.
- **RF-8.4** Si *una partida se finaliza*, el sistema *debe aplicar una uma de **30, +10, −10 y
  −30** puntos al 1.º, 2.º, 3.º y 4.º respectivamente*.
- **RF-8.5** El sistema *debe tomar como punto de retorno los **30 000** puntos*, de modo que *la
  puntuación final de cada jugador sea la suma de su marcador más su uma*.
- **RF-8.6** El sistema *no debe aplicar ningún ajuste adicional de puntos por posición (atozuke)*.
- **RF-8.7** Si *un jugador alcanzó los 30 000 puntos en algún momento de la partida*, el sistema
  *debe advertir que el reglamento de referencia habría terminado ahí la partida* y *debe permitir
  seguir capturando*.
- **RF-8.8** Si *tras aplicar los puntos de un turno algún jugador queda por debajo de cero*, el
  sistema *debe considerar la partida terminada*, *debe finalizar el turno aplicando los deltas
  íntegros* y *debe registrar una marca de bancarrota en el resultado*, con el saldo negativo
  resultante como puntuación final.

> **Por qué:** el resultado final es lo que alimenta el ranking y las estadísticas. Que exista una
> única regla, con un desempate declarado, sin atozuke y con el uma puntuando, es lo que hace
> comparables dos temporadas distintas. Los 30 000 puntos como umbral de referencia y no como final
> obligatorio es una desviación deliberada del reglamento de referencia, documentada en
> `docs/domain.md §4.5`.

---

### RF-9 · Finalización e inmutabilidad

- **RF-9.1** Cuando *una partida abierta ha registrado al menos el mínimo de turnos de su modo*, el
  sistema *debe permitir finalizarla de forma explícita*, previa confirmación.
- **RF-9.2** Si *se intenta finalizar una partida por debajo del mínimo de turnos de su modo*, el
  sistema *debe pasarla al estado `abortada`*, y *la partida no debe poder finalizarse nunca más*.
- **RF-9.3** Si *una partida está finalizada*, el sistema *debe rechazar cualquier modificación
  posterior* de sus turnos o de su resultado.
- **RF-9.4** Si *una partida finalizada contuviera un error de captura*, el sistema *debe permitir
  deshacer la finalización para volver a corregirla*, dejando constancia de que se hizo y de quién.
- **RF-9.5** El sistema *debe permitir deshacer la finalización de una partida cuya temporada está
  cerrada*, y *debe recalcular sus estadísticas y su ranking*.
- **RF-9.6** Si *se corrige un turno de una partida abierta*, el sistema *debe recalcular el
  resultado de la partida y sus estadísticas derivadas*.

> **Por qué:** la inmutabilidad garantiza que las estadísticas de temporada cerrada no cambien bajo
> los pies. La posibilidad de deshacer evita que un error de última hora deje la temporada
> permanentemente incorrecta, sin abrir la puerta a reescribir el pasado. Por eso deshacer también
> funciona con la temporada cerrada: el error hay que poder corregirlo siempre.

---

### RF-10 · Partidas sin finalizar

- **RF-10.1** El sistema *debe permitir mantener una partida abierta mientras se juega* y *debe
  permitir salir de la sesión de usuario sin que ello afecte a lo capturado*.
- **RF-10.2** Mientras *una partida no esté en estado `finalizada`*, el sistema *no debe contabilizar
  sus resultados en las estadísticas de jugador ni en el ranking de temporada*.
- **RF-10.3** El sistema *debe permitir reabrir y seguir capturando turnos de una partida abierta*.
- **RF-10.4** Si *una partida abierta lleva más de **7 días** sin actividad*, el sistema *debe
  ofrecer abandonarla como partida inconclusa*, conservando los turnos registrados sin que computen
  en ningún agregado.
- **RF-10.5** Si *una partida abierta que lleva más de **7 días** sin actividad se retoma*, el
  sistema *debe advertirlo antes de continuar* para que el capturador confirme que no está
  combinando dos sesiones distintas.
- **RF-10.6** Si *una partida abierta tiene marcado el cierre obligatorio por bancarrota*, el sistema
  *debe permitir únicamente finalizarla*, además del registro de auditorías.

> **Por qué:** una partida que se dejó a medias es un hecho real del club, no un error. Ocultarla
> sería peor que mostrarla, pero contarla como si estuviera completa falsearía el ranking. El umbral
> de 7 días es una reunión semanal, que es la unidad real del club.

---

### RF-11 · Temporadas

- **RF-11.1** Cuando *se va a abrir una temporada*, el sistema *debe pedir su nombre y sus fechas de
  inicio y fin*.
- **RF-11.2** Si *las fechas de una nueva temporada se solapan con las de una temporada existente*, el
  sistema *debe rechazar la creación* e indicar qué rango se solapa.
- **RF-11.3** Si *la fecha de inicio es posterior a la fecha de fin*, el sistema *debe rechazar la
  creación*.
- **RF-11.4** Si *se crea una partida con fecha dentro del rango de una temporada cerrada*, el
  sistema *debe rechazarla*.
- **RF-11.5** El sistema *debe asignar cada partida a la temporada cuyo rango de fechas contiene su
  fecha*, sin que el capturador elija, y *debe documentar esa regla*.
- **RF-11.6** Si *la fecha de una partida no cae dentro de ninguna temporada*, el sistema *debe
  mantenerla fuera de todo ranking y de todo resumen de temporada* sin considerarla inválida.
- **RF-11.7** El sistema *debe permitir consultar el listado de temporadas* con su nombre y periodo.

> **Por qué:** sin temporadas, las estadísticas mezclarían periodos incomparables. La asignación por
> fecha es la única que sobrevive a los solapamientos deliberados entre temporadas, y por eso el
> solapamiento se prohíbe en lugar de permitirse: si dos temporadas comparten fechas, la fecha de una
> partida no puede decir a cuál pertenece.

---

### RF-12 · Estadísticas por jugador y temporada

- **RF-12.1** El sistema *debe mostrar, por jugador y por temporada, el número de partidas
  finalizadas en las que participó*.
- **RF-12.2** El sistema *debe mostrar, por jugador y por temporada, el número de victorias (1.ª
  posición)*.
- **RF-12.3** El sistema *debe mostrar, por jugador y por temporada, el desglose de posiciones
  obtenidas* (primera, segunda, tercera y cuarta).
- **RF-12.4** El sistema *debe mostrar, por jugador y por temporada, los contadores acumulados de
  yaku sobre sus partidas*: riichi, dora, kan, tsumo, ron, chombo, hai tei raoyue,
  renchán de apertura y yakuman.
- **RF-12.5** El sistema *debe permitir consultar el detalle de las partidas que componen esas
  estadísticas*, para que *cualquier cifra sea rastreable hasta su origen*.
- **RF-12.6** El sistema *debe mostrar las estadísticas de un jugador con cualquier número de
  partidas jugadas, sin exigir un mínimo*, y *debe mostrar el número de partidas junto a cada cifra*
  para que su media no distorsione la comparación con el resto.
- **RF-12.7** El sistema *no debe computar estadísticas a partir de partidas que no estén
  finalizadas*.
- **RF-12.8** El sistema *debe calcular la puntuación acumulada de un jugador como la suma de sus
  puntuaciones finales con uma*, que puede ser negativa.

> **Por qué:** una estadística que no se puede rastrear hasta las partidas que la componen no es
> creíble. La trazabilidad es el motivo por el que el club puede aceptar que otra persona la revise.
> Y toda cifra tiene que ir acompañada del número de partidas que la sostienen, porque una media sin
> denominador no significa nada.

---

### RF-13 · Ranking de temporada

- **RF-13.1** El sistema *debe mostrar la clasificación de la temporada*, ordenada por puntuación
  acumulada **con uma**.
- **RF-13.2** El sistema *debe indicar la puntuación acumulada de cada jugador de la clasificación*.
- **RF-13.3** Si *hay empate en la puntuación acumulada*, el sistema *debe desempatar, en este orden y
  siempre igual*, por **número de victorias**, luego **número de veces en segunda posición**, luego
  **orden alfabético del nombre**.
- **RF-13.4** Si *una temporada no tiene partidas finalizadas*, el sistema *debe mostrar la
  clasificación vacía*, sin errores ni datos inventados.
- **RF-13.5** El sistema *debe permitir consultar el ranking de cualquier temporada*, incluida la
  actual.
- **RF-13.6** El sistema *debe incluir en la clasificación solo a los jugadores con al menos una
  partida finalizada en esa temporada*.
- **RF-13.7** El sistema *debe exigir que se elija una temporada* para mostrar un ranking, de modo
  que nunca se mezclen periodos.

> **Por qué:** el ranking es la salida que el club realmente consume. Su valor depende de que el
> mismo criterio de desempate se aplique en todas las temporadas; si cambiase, las temporadas dejarían
> de ser comparables entre sí.

---

### RF-14 · Consulta sin cuenta

- **RF-14.1** El sistema *debe permitir a un visitante, sin cuenta, consultar los resultados de las
  partidas, las estadísticas de jugador y el ranking de la temporada seleccionada*.
- **RF-14.2** El sistema *no debe permitir a un visitante crear ni modificar información alguna*.
- **RF-14.3** Si *un visitante intenta iniciar sesión*, el sistema *debe dirigirle a la pantalla de
  acceso* sin mostrar detalles de la cuenta ni información sobre los demás usuarios.
- **RF-14.4** El sistema *debe mostrar a cualquier visitante quién registró cada turno*, porque la
  trazabilidad de la captura es pública en un club sin estructura.

> **Por qué:** que el club se pueda seguir sin registrarse baja la barrera de entrada sin abrir
> ningún riesgo, porque el visitante no puede escribir nada. En un club sin jerarquía, ocultar quién
> escribió qué no protege nada.

---

### RF-15 · Captura únicamente con sesión iniciada

- **RF-15.1** El sistema *debe exigir una sesión iniciada para crear, capturar, corregir o finalizar
  una partida*.
- **RF-15.2** El sistema *debe exigir una sesión iniciada para dar de alta o baja jugadores, para
  borrarlos y para crear o cerrar temporadas*.
- **RF-15.3** Si *un visitante intenta acceder a una acción de captura*, el sistema *debe
  interceptarle y pedirle que inicie sesión*, conservando lo que hubiera escrito hasta ese momento.
- **RF-15.4** El sistema *debe recordar la sesión iniciada entre visitas*, para no exigir
  autenticación en cada partida.
- **RF-15.5** El sistema *no debe distinguir entre niveles de usuario con sesión iniciada*: todas las
  acciones de captura, administración y borrado están disponibles para cualquier usuario que haya
  iniciado sesión.
- **RF-15.6** El sistema *debe permitir capturar sin conexión*, escribiendo en la caché local
  persistente y sincronizando después, y *debe resolver un conflicto de dos dispositivos sobre el
  mismo número de turno rechazando el segundo*, como en RF-3.8.
- **RF-15.7** Si *una acción de captura se intenta sin sesión iniciada*, el sistema *debe conservar el
  contenido del formulario y restaurarlo al volver*, para que *pedir la sesión no cueste el trabajo ya
  hecho*.
- **RF-15.8** El sistema *debe conservar un borrador del turno en curso*, de modo que *cerrar la
  aplicación a mitad de una captura no la pierda*.
- **RF-15.9** El sistema *debe autenticar mediante Firebase Authentication con correo y contraseña*, y
  *no debe registrar cuentas ni gestionar credenciales*: quién tiene cuenta se concede fuera del
  sistema, como en la nota de §2. Un intento con credenciales incorrectas *debe rechazarse con un único
  mensaje*, que no revele si la cuenta existe.

> **Por qué:** el club es una comunidad pequeña y de confianza, sin estructura jerárquica. Un único
> perfil con sesión iniciada es más sencillo de usar y suficiente; la decisión de quién tiene cuenta
> se toma fuera del sistema. Y la red en un local de juego no es fiable, así que capturar no puede
> depender de que haya cobertura.

---

### RF-16 · Cálculo del valor de la mano

- **RF-16.1** Para *cada turno con resultado de mano*, el sistema *debe calcular el valor de cada
  mano ganadora* a partir de sus han de yaku, su recuento de dora, su fu, su contador de honba, su
  condición de localía y el tipo de resultado.
- **RF-16.2** El sistema *debe calcular los deltas de cada turno a partir del valor de las manos*, y
  *no debe permitir que se introduzcan a mano*.
- **RF-16.3** El sistema *debe aplicar la precedencia de manos límite antes que la fórmula*: yaku de
  límite o 13 o más han producen yakuman; 6 a 12 han producen sanbaiman, baiman o haneman; 5 han, o
  4 han con 40 fu o más, o 3 han con 70 fu o más, producen mangan.
- **RF-16.4** El sistema *debe redondear cada pago hacia arriba a la centena más próxima, de forma
  independiente*, y *no debe redondear el total*.
- **RF-16.5** El sistema *debe calcular el mismo resultado con los mismos datos de entrada*, sin
  depender del dispositivo, del usuario que captura ni del orden de introducción de los datos.
- **RF-16.6** Si *una mano tiene 25 fu y el sistema no la puntúa como chiitoitsu*, o *al revés*, el
  sistema *debe rechazarla*.

> **Por qué:** este es el requisito que hace que HU-4 sea verdad. Si quien captura teclea los puntos,
> el motor no añade nada: el mismo error de siempre, solo que con un formulario delante. El motor es
> lo que convierte el registro en una fuente fiable.

---

### RF-17 · Gráficas

- **RF-17.1** El sistema *debe mostrar la evolución de la puntuación acumulada por partida de un
  jugador en la temporada seleccionada*.
- **RF-17.2** El sistema *debe mostrar el desglose de posiciones del jugador en esa temporada*.
- **RF-17.3** El sistema *debe mostrar qué yaku accumulate más ese jugador en esa temporada*.
- **RF-17.4** Las gráficas *deben construirse con los mismos datos que las tablas de estadísticas*, de
  modo que no puedan discrepar de ellas.
- **RF-17.5** Las gráficas *no sustituyen a ninguna cifra*: *cada valor dibujado debe ser legible y
  comprobable contra su tabla*.

> **Por qué:** las gráficas son una lectura de las mismas cifras, no una fuente nueva. Si una gráfica
> pudiera mostrar algo que la tabla no muestra, habría dos verdades sobre la misma temporada.

---

## 5. Requisitos no funcionales

| # | Requisito | Por qué |
| --- | --- | --- |
| **RNF-1** | El resultado de una partida debe ser **idéntico** con independencia de quién la capturó y del dispositivo usado. | Si el resultado depende del capturador, el histórico pierde valor de referencia |
| **RNF-2** | Cada turno registrado debe quedar **rastreable** hasta el resultado de la partida y hasta el usuario que lo capturó. | Permite auditar cualquier cifra del ranking sin recalcular a mano |
| **RNF-3** | Los cálculos de una temporada deben ser **reproducibles** y las reglas aplicadas deben estar **versionadas**: cambiar una constante no puede reescribir temporadas ya calculadas. | Permite detectar y corregir divergencias |
| **RNF-4** | La aplicación debe funcionar en **móvil y escritorio**, porque la captura ocurre junto a la mesa y desde el teléfono. | Es la forma real de jugar al club |
| **RNF-5** | La captura de un turno debe completarse **sin conexión** mediante caché local persistente, y sincronizarse después. El conflicto entre dispositivos lo resuelve el rechazo del turno duplicado. | La red en un local de juego no es fiable |
| **RNF-6** | Los datos de **temporadas diferentes no deben mezclarse** en ninguna vista de resumen, y una vista de ranking exige una temporada elegida. | Es la causa más frecuente de cifras mal interpretadas |
| **RNF-7** | La aplicación debe poder **mostrar los datos sin cuenta**, sin exponer credenciales ni detalles de las cuentas. | El club debe ser público en sus resultados |
| **RNF-8** | Cada partida debe quedar **fechada** y su temporada **deducida de la fecha**, de forma que el histórico pueda reconstruirse por orden cronológico. | Permite detectar temporadas incompletas o partidas mal fechadas |

---

## 6. Casos límite

### Partida y captura

1. **Partida abierta durante toda la sesión y abandono del dispositivo.** La partida queda
   disponible para retomar y nada de lo capturado se pierde.
2. **Corrección de un turno ya guardado mientras la partida sigue abierta.** Se permite, y el
   resultado de la partida y sus estadísticas se recalculan.
3. **Intento de corregir un turno de una partida ya finalizada.** Se rechaza con un mensaje que indica
   que primero hay que deshacer la finalización.
4. **Guardar el mismo número de turno dos veces.** Se rechaza; el sistema no sobrescribe en
   silencio.
5. **Intento de capturar el turno 3 sin haber capturado el 2.** Se rechaza: la numeración es
   correlativa y sin huecos.
6. **Partida abandonada sin acabar nunca.** Queda inconclusa, con sus turnos visibles y sin efecto en
   estadísticas ni ranking.
7. **Retomar una partida abierta más de 7 días después.** Se advierte antes de continuar.
8. **Un mismo jugador en dos partidas abiertas a la vez.** Se permite; si ambas se finalizan, cuentan
   como dos partidas, que es lo correcto.
9. **Dos dispositivos del mismo usuario capturando a la vez.** Gana el primero que llega al servidor;
   el segundo recibe el rechazo de turno duplicado.

### Finalización

10. **Finalizar un hanchan con 7 turnos.** Se rechaza y la partida pasa a `abortada`.
11. **Partida `abortada` que se quiere recuperar.** No se puede: el estado es terminal. Sus turnos y
    sus fichas de riichi quedan visibles.
12. **Clic accidental en finalizar una partida corta.** Es irreversible por diseño; por eso RF-9.1
    exige confirmación previa.
13. **Deshacer la finalización de una partida de una temporada cerrada.** Se permite y recalcula
    estadísticas y ranking.
14. **Finalizar una partida que quedó pendiente de cierre por bancarrota.** Es la única acción
    permitida.

### Cálculo

15. **Empate (`ryuukyoku`) en un turno.** Los tenpai cobran del no tenpai; las fichas de riichi **no**
    se adjudican y permanecen en el bote.
16. **Tsumo.** El reparto se hace con los multiplicadores de tsumo y el bote se adjudica a quien gana.
17. **Múltiple ron con dos ganadores.** Cada uno cobra su mano íntegra; el descartador paga la suma.
18. **Múltiple ron con tres ganadores.** Igual que el caso anterior.
19. **Más de tres ganadores en un mismo turno.** Se rechaza por imposible.
20. **Suufon renta: ganan los cuatro a la vez.** Se registra como tsumo normal con cuatro ganadores.
21. **Empate en la puntuación final de la partida.** Gana el de menor asiento: Este, Sur, Oeste,
    Norte.
22. **Empate en la puntuación acumulada de la temporada.** Se aplica el criterio declarado: victorias,
    luego veces en segunda, luego alfabético.
23. **Fichas de riichi sin reclamar en una partida inconclusa.** Quedan registradas y se pierden.
24. **Chombo a mitad de la partida.** La partida **no** se interrumpe: se restan 8000 en ese turno y
    se sigue jugando.
25. **Chombo que lleva a un jugador por debajo de cero.** La partida termina, se finaliza con el
    saldo negativo y computa en el ranking.
26. **Alguien alcanza 30 000 puntos.** Se advierte y se puede seguir capturando.
27. **Un jugador declara riichi y gana en el mismo turno.** La ficha entra en el bote y el ganador se
    lo lleva íntegro en ese mismo turno.
28. **Los cuatro declaran riichi.** Las cuatro fichas van al bote y se reparten entre las manos
    ganadoras según el valor.
29. **Un chombo en una partida que además tiene riichi declarado.** Ambas penalizaciones se aplican y
    la partida sigue abierta.
30. **Empate en prórroga con reparto de 1000 puntos.** Los tenpai desplazan 1000 a los tenpai
    alineados, en orden de ronda.
31. **Pinoche o chiitoitsu con 20 fu por ron.** Se rechaza: los 20 fu solo existen por pinfu, que
    exige tsumo.
32. **Chiitoitsu ganado por tsumo.** Puntúa 3 han 25 fu, porque el tsumo de mano cerrada siempre suma
    su han.
33. **Mangan por 3 han y 70 fu.** Se aplica el umbral, no la fórmula.
34. **Una mano de 13 han sin ningún yaku de límite.** Es yakuman.
35. **Una mano de 4 yaku de límite.** Es un único yakuman de 8000 puntos básicos, sin multiplicar.
36. **Una mano con 13 dora y ningún yaku real.** Se rechaza: los dora no sustituyen a un yaku.
37. **Una mano ganada con dos honba.** Cada contador añade 300 puntos repartidos como un tsumo, de modo
    que un tsumo de localía con honba 1 vale lo mismo que el ron de la misma mano con honba 1.

### Jugadores, temporadas y datos

38. **Invitado que repite en una segunda partida.** Se reconoce por su identificador y sus
    estadísticas se acumulan.
39. **Jugador dado de baja con temporadas anteriores.** Su histórico se conserva y no se reasigna.
40. **Jugador dado de baja que participa en una partida abierta.** Se puede seguir capturando.
41. **Dos personas distintas con el mismo nombre pero identificador distinto.** Son dos jugadores.
42. **Temporadas con fechas solapadas.** Se rechaza la creación de la segunda.
43. **Partida con fecha fuera de toda temporada.** Se conserva y queda fuera de los rankings.
44. **Partida con fecha dentro de una temporada cerrada.** Se rechaza la creación.
45. **Temporada recién creada sin ninguna partida finalizada.** El ranking se muestra vacío, sin
    errores.
46. **Jugador con cero partidas finalizadas en la temporada.** No aparece en el ranking; sí aparece
    en la lista de jugadores.

### Acceso

47. **Visitante que intenta capturar.** Se le pide iniciar sesión sin perder lo que hubiera escrito.
48. **Sesión iniciada que deja de ser válida.** El sistema lo indica y conserva el trabajo hecho para
    que se pueda recuperar.
49. **Captura sin cobertura durante toda una partida.** Todos los turnos se guardan en local y se
    sincronizan al recuperar la conexión.

---

## 7. Fuera de alcance

### Vetado explícitamente en esta etapa

- **Exportar e importar datos.** No habrá descarga de información ni carga masiva.
- **Notificaciones y recordatorios.** No se enviarán avisos por ningún medio.

### Decidido para futuras especificaciones

- **Sistema de reglas M.League.** El campo de reglas existe en la partida, pero solo se ofrece
  Mahjong Souls. Una partida creada con `mleague` no admite captura.
- **Puntuación por mano (rating o ELO).** Se verá en una especificación posterior.
- **Registro de las fichas de la mano ganadora.** Requiere capturar el reparto, y con ello haría
  verificables también el recuento de dora y la composición de la mano. Es el siguiente paso natural
  una vez que el histórico esté completo.
- **Verificación del recuento de dora.** Mientras no se guarden las fichas, el número de dora lo
  pone quien captura y ninguna validación puede detectarlo. Declarado como punto ciego conocido.

### Fuera de alcance por definición del MVP

- **Ajuste de puntos por posición (atozuke).** No se aplica en ningún momento.
- **Aplicación móvil nativa.** La aplicación funciona en navegador, también en el móvil.
- **Gestión de cuentas, invitaciones y roster.** La aplicación no administra quién tiene cuenta: eso
  se resuelve fuera del sistema.
- **Niveles de permiso entre usuarios.** No existen. Cualquiera con sesión iniciada puede capturar,
  administrar y borrar.
- **Penalizaciones por abandono distintas del chombo.**
- **Cálculo de yaku a partir de la mano.** El sistema registra qué yaku hubo y los valida uno a uno
  contra reglas comprobables; no los deduce de las fichas.
- **Niveles de partida intermedios entre `abierta` y `finalizada`.**

---

## 8. Criterios de finalización

La especificación se considera cumplida cuando **todas** estas condiciones se cumplen:

### Sobre las partidas

1. Se puede crear una partida con sus cuatro participantes, su longitud y su fecha, y capturarla
   completa turno a turno mientras se juega.
2. Una partida puede dejarse abierta, retomarse al día siguiente y seguir capturando.
3. Una partida no admite modificaciones sin deshacer antes la finalización, y deshacer funciona
   también con la temporada cerrada.
4. Una partida con error de captura puede corregirse mientras está abierta y sus resultados se
   actualizan.
5. Una partida por debajo del mínimo de turnos pasa a `abortada` y no puede volver a finalizarse.
6. Una partida con bancarrota se cierra finalizada, con el saldo negativo y computando en el ranking.

### Sobre los cálculos

7. El sistema reproduce sin intervención manual el valor de cada mano, el marcador final, las
   posiciones, el uma y el reparto de fichas de riichi de una partida completa.
8. El sistema resuelve correctamente los casos de empate, tsumo, múltiple ron de dos y tres
   ganadores, suufon renta y chombo con su penalización, sin interrumpir la partida.
9. La puntuación final de la partida es la misma con independencia de quién la capturó y del
   dispositivo usado, incluso sin conexión.
10. Aplicar las reglas de nuevo a las partidas registradas reproduce el mismo ranking de temporada.
11. Todas las desviaciones del reglamento de referencia declaradas en `docs/domain.md §4.5` están
    implementadas y cubiertas por un test.

### Sobre temporadas y resultados

12. Se pueden crear y cerrar temporadas sin solaparlas, y cada partida se asigna a su temporada por
    fecha sin que el capturador elija.
13. Las estadísticas de jugador por temporada muestran partidas, victorias, posiciones, puntuación
    acumulada con uma y contadores de yaku, y cada cifra permite llegar a las partidas que la
    componen.
14. El ranking de temporada se muestra ordenado por puntuación con uma, con desempate explícito y
    consultable para temporadas anteriores.
15. Las partidas no finalizadas, inconclusas y abortadas no alteran ninguna estadística ni ningún
    ranking.
16. Las gráficas muestran la evolución, el desglose de posiciones y los yaku más frecuentes, con los
    mismos datos que las tablas.

### Sobre el acceso

17. Un visitante sin cuenta puede consultar resultados, estadísticas y ranking, y no puede modificar
    nada.
18. Cualquier acción de captura, administración y borrado exige sesión iniciada y se rechaza sin
    ella.
19. La sesión iniciada se mantiene entre visitas.
20. El formulario de captura se conserva al pedir la sesión y al cerrar la aplicación, y se restaura
    al volver.
21. Se puede iniciar sesión con credenciales válidas, se rechazan las incorrectas con un único mensaje
    que no revela si la cuenta existe, y la sesión se mantiene entre visitas.

### Sobre el documento

22. Todas las dudas que estaban marcadas como `[NECESITA ACLARACIÓN]` están resueltas y registradas en
    §9, y ninguna vuelve a abrirse sin decisión nueva.
23. Cada regla de puntuación aplicada —punto de partida, punto de retorno, uma, valor de mano,
    redondeo, reparto de fichas de riichi, múltiple ron, suufon renta, chombo, bancarrota y
    desempate— está documentada en `docs/domain.md` con un ejemplo numérico que un jugador del club
    pueda comprobar a mano.
24. Cada desviación respecto del reglamento de referencia está escrita, es implementable y tiene su
    test.

---

## 8.1 Derogaciones posteriores

Esta especificación se da por cerrada, pero tres de sus requisitos han sido **derogados** por
[`../002/spec.md`](../002/spec.md). Se registran aquí para que nadie implemente 001 a la letra creyendo que
sigue vigente cuando ya no lo está, y para que quede constancia de qué lo sustituye.

Ninguna tarea marcada de este documento se desmarca: una derogación no reabre 001, cambia lo que 001
exige.

| RF derogado | Qué exigía | Qué lo sustituye | Por qué |
| ----------- | ---------- | ----------------- | ------- |
| **RF-3.13** | Que un turno con resultado de mano **exigiera** el número de han de yaku, el contador de honba y el asiento de la localía como datos de entrada | Que el sistema **los calcule** y los muestre: RF-18.1 y RF-22 de 002 | El catálogo ya declara el han de cada yaku y `nextHand()` ya sabe calcular la localía, y ninguno de los dos se usaba. Pedirlos a mano convertía el motor en adorno |
| **RF-4.3** | Que se rechazara un turno registrado con `yakuHan` en cero | Que se rechace cuando **no se ha seleccionado ningún yaku real**, aunque el ajuste manual eleve los han: RF-22.8 | Con el han derivado, `yakuHan == 0` y «no hay yaku» dejan de ser lo mismo en cuanto existe un ajuste manual |
| **RF-6.5** | Que se pudiera registrar un `suufon renta`, es decir cuatro ganadores por tsumo | **Queda vetado.** La captura de cuatro ganadores por tsumo se rechaza: RF-21.5 de 002 | Decisión del club. El motor conserva la capacidad y su test sigue pasando; lo que desaparece es el camino para llegar a ella |

Las tres decisiones están argumentadas en [`../002/spec.md`](../002/spec.md) §4, con su alternativa
descartada, y su traza en [`../../docs/reviews/002-qa.md`](../../docs/reviews/002-qa.md).

---

## 9. Dudas resueltas

Las dudas que esta especificación dejó abiertas durante su redacción, y la decisión que las cierra.
Ninguna vuelve a abrirse sin una decisión nueva y explícita.

| # | Duda | Decisión | Consecuencia asumida |
| - | ---- | -------- | --------------------- |
| 1 | Si se puede guardar el turno 3 sin el 2 | **No.** La numeración es correlativa y sin huecos | El turno primero al reanudar es siempre el siguiente al último guardado |
| 2 | Quién se lleva las fichas de riichi en un ron múltiple | **El ganador de mayor valor**, con el asiento de Este a Norte como desempate | El motor compara manos, que ya calcula |
| 3 | Si los 30 000 puntos cierran la partida | **No: avisan y se puede seguir** | Desviación declarada del reglamento de referencia |
| 4 | Si el MVP incluye gráficas | **Sí**, con tres visualizaciones alimentadas por las mismas cifras que las tablas | chart.js queda legitimado en el stack |
| 5 | Si un jugador puede estar en dos partidas abiertas | **Sí**, con el supuesto de trabajo confirmado | Si ambas se finalizan, cuentan como dos |
| 6 | Si el chombo interrumpe la partida | **No**, es una penalización de 8000 en el turno | La partida computa y su suma es 92 000 |
| 7 | Qué pasa si el chombo deja a alguien bajo cero | **La partida termina** | El turno se aplica íntegro y el negativo es la puntuación final |
| 8 | En qué estado termina una bancarrota | **`finalizada`**, computando en el ranking | No hay estado nuevo para la bancarrota |
| 9 | Si `abortada` es recuperable | **No, es terminal** | Un clic accidental en finalizar es irreversible; por eso hay confirmación |
| 10 | El desempate dentro de una partida | **Por asiento, de Este a Norte** | Con el uma, el empate decide entre +30 y +10 |
| 11 | El desempate en la clasificación | **Victorias, luego veces en segunda, luego alfabético** | Es el mismo en todas las temporadas |
| 12 | Cuánto es un periodo prolongado | **7 días**, una reunión semanal | Avisa al retomar y ofrece abandonar |
| 13 | A qué temporada pertenece una partida | **Por fecha, sin elección del capturador** | Por eso el solapamiento de temporadas se prohíbe |
| 14 | El chombo y el invariante de suma del turno | **La suma es cero salvo chombo** y riichi declarado | La fórmula exacta está en RF-4.1 |
| 15 | Si el sistema comprueba yaku imposibles | **Solo los verificables**: yaku de viento, chiitoitsu contra fu, combinaciones no representables y ausencia de yaku real | Se declara que la cobertura es parcial |
| 16 | Kiriage mangan | **No se aplica** | 4 han 30 fu y 3 han 60 fu valen 7700 y 11 600 |
| 17 | Cómo puntúa un chiitoitsu por tsumo | **Como 3 han 25 fu**, con menzen tsumo | Se rellenan las celdas de tsumo de 25 fu |
| 18 | Los yaku de límite | **Trece, y todos valen 8000 puntos básicos** | No existe doble yakuman |
| 19 | Si 13 han normales cuentan como yakuman | **Sí** | El umbral es sobre han totales, dora incluido |
| 20 | Si los dora suman han | **Sí**, incluidos aka dora y ura dora, pero hace falta al menos un yaku real | El recuento de dora no es verificable sin la mano |
| 21 | La lista de yaku y las reglas de fu | **Lista completa estándar con reglas de fu estándar, sin double riichi** | Una mano con double riichi puntúa 1 han menos |
| 22 | Quién puede borrar jugadores y temporadas | **Cualquiera con sesión iniciada** | No hay claim `admin` en las reglas |
| 23 | Cómo se cumple RNF-5 sin conexión | **Caché local persistente de Firestore** | El conflicto entre dispositivos lo resuelve el rechazo del turno duplicado |
| 24 | Cómo se reconoce a un invitado entre partidas | **Por el identificador que aporta el club** | Su formato se valida, porque un identificador mal escrito parte el historial |
| 25 | Cuál es la regla de ese identificador | **El club lo mantiene fuera del sistema** | El sistema solo comprueba su formato |
| 26 | Cuáles son los formatos válidos de un identificador | **Código de 2 a 12 alfanuméricos, o alias de 2 a 32 con guion y guion bajo en el interior** | Se cerraron al implementar `domain/types.ts`: sin ellos, RF-1.9 exigía validar un formato que nadie había definido. La normalización a minúsculas es lo que impide que un mismo identificador tecleado con otra caja cree un jugador nuevo |
| 27 | Cómo se obtiene la sesión que exigen RF-15.1 y RF-15.2 | **Con correo y contraseña mediante Firebase Authentication (RF-15.9)**, sin registro en la aplicación | Se separan **autenticación** (dentro, RF-15.9) de **gestión de cuentas** (fuera, §2 y §7). El mensaje de credenciales incorrectas es único: quien no tiene cuenta recibe el mismo texto que quien teclea mal, así que el club tiene que comunicar el alta de cuentas por fuera |

---

## 10. Nota para el plan técnico

Este documento define **qué** debe hacer el sistema y **por qué**. Las decisiones de tecnología,
arquitectura y organización del código no forman parte de esta especificación y van en el plan
técnico.

Se hacen notar cinco decisiones ya tomadas que condicionarán ese plan:

1. **El sistema de reglas se guarda en la partida aunque hoy solo haya uno disponible**, para que el
   histórico siga siendo interpretable cuando se añada M.League. `ruleset` es `'mahjongSouls'`, y
   el valor `'mleague'` existe en el modelo pero no admite captura.
2. **El valor de cada mano lo calcula el sistema**, a partir de han de yaku, recuento de dora, fu,
   localía y tipo de resultado. Esto obliga a un módulo de cálculo puro y a tests del 100 % sobre
   él, y es lo que hace que HU-4 sea verdad.
3. **La corrección de una partida finalizada exige deshacer primero la finalización**, incluso con
   la temporada cerrada, y ese registro de operación debe conservarse.
4. **La temporada se deduce de la fecha de la partida**, así que `seasonId` tiene que admitir nulo y
   no lo elige el capturador. Por eso el solapamiento de temporadas se rechaza.
5. **La gestión de cuentas no pertenece al sistema**, pero **la autenticación sí**: RF-15.9 mete la
   autenticación con correo y contraseña dentro de la aplicación, mientras que el alta de cuentas, las
   invitaciones y el roster siguen resolviéndose fuera del sistema, como en §2 y en §7. En
   consecuencia, `firestore.rules` **no puede** distinguir quién borra, y la anterior restricción por
   claim `admin` queda derogada.

Además, RNF-3 exige versionar las reglas aplicadas. Una partida guardada debe poder responder con qué
versión de las constantes se calculó, de modo que cambiar la tabla de puntuaciones en el futuro no
reescriba temporadas ya calculadas.
