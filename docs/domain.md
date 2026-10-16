# domain.md — Mahjong Riichi Club

Modelo de dominio de **MahjongBuClub**: cómo es una partida, cómo se registra un turno y cómo se
calculan los puntos.

Este documento describe **el dominio** y las **reglas de puntuación**. Las convenciones de software
están en [`../AGENT.md`](../AGENT.md).

---

## 1. Vocabulario

| Término          | Significado                                                          |
| ---------------- | -------------------------------------------------------------------- |
| **Ronda**        | Etapa identificada por el viento: Este, Sur, Oeste, Norte            |
| **Mano / turno** | Una mano individual dentro de una ronda                              |
| **Dealer (kyoku)** | El jugador de la derecha                                          |
| **Renchan**      | La mano se repite porque el dealer ganó o drew con tenpai            |
| **Tenpai**       | Mano completa a la espera de ganar; se puede declarar *riichi*       |
| **Riichi stick** | Ficha de 1000 puntos que se pierde al declararse riichi             |
| **Bote de mesa** | Fichas de riichi pendientes de reclamar                              |
| **Han / Fu**     | Recuento de yaku y de fu de una mano; su producto da el valor        |
| **Uma**          | Bonificación por posición final respecto del punto de retorno        |
| **Chombo**       | Penalización repartida entre la mesa por abandono de partida          |
| **Yakuman**      | Yaku de límite, o mano de 13 o más han                               |
| **Bancarrota**   | Situación de un jugador cuyo saldo queda por debajo de cero          |

---

## 2. Estructura de una partida

Una partida se organiza en rondas por los vientos cardinales. Cada ronda consta de **cuatro manos**
individuales, una por cada jugador como localía de ese viento, pasando el turno a la izquierda según
la dirección de juego.

### Longitud de partida

Se admiten dos modalidades, registradas en `games.gameLength`:

- **Tonpuusen** — únicamente la ronda del Este. Mínimo **4** manos, más las prórrogas que surjan si
  el Este repite o si nadie alcanza los 30 000 puntos al cerrar la ronda.
- **Hanchan** — las rondas del Este y del Sur completas. Mínimo **8** manos, más sus repeticiones y
  las prórrogas eventuales en el Oeste si el punto de victoria no lo ha alcanzado el líder al cerrar
  la octava mano.

El mínimo es un **piso de finalización**, no una longitud esperada: por debajo de él, una partida no
puede finalizarse nunca.

### Prórroga (*sudden death*)

Al terminar la última ronda prevista, si el jugador en cabeza **no** ha alcanzado los **30 000**
puntos, se añade una mano de prórroga con un único objetivo:

- **Tsumo** del jugador en cabeza → termina.
- **Ron** de cualquier otro jugador contra la mano del líder → termina.
- **Draw** de cualquier mano que no sea la del líder → los tenpai desplazan 1000 puntos a los tenpai
  alineados, en orden de posición en la ronda.
- **El líder completa una mano válida y nadie le ha hecho *ron*** → se aplica el mismo reparto de
  tenpai que en un empate.

El club juega con los puntos de 30 000 como **umbral de referencia, no como final obligatorio**: al
alcanzarlo, el sistema advierte y permite seguir capturando. Es una desviación deliberada respecto
del reglamento de referencia y está registrada como tal en §4.7.

### Fin de mano

- **Ganancia por *tsumo***: solo el dealer. Cada mano se paga con los multiplicadores de §4.3, según si
  ese ganador es dealer o no, y no hay descartador.
- **Ganancia por *ron***: hasta tres jugadores a la vez (*sanchan ron*). **El descartador paga la suma
  de los valores íntegros de cada mano ganadora**, sin repartir el pago entre los ganadores.
- **Empate (*ryuukyoku*)**: 3000 puntos en total salen del jugador sin tenpai y se reparten a partes
  iguales entre los tenpai. No cambia si ese jugador es el dealer o no: si solo falta él, paga los
  3000 completos. **Las fichas de riichi no se adjudican** y permanecen en el bote.

> **El *suufon renta* —cuatro ganadores por tsumo en la misma mano— queda fuera de lo capturado**, por
> decisión del club. La captura se rechaza. `domain/turn.ts` conserva la capacidad de resolverlo y su
> test sigue pasándose; lo que desaparece es el camino para llegar a ella desde la interfaz. Deroga 001
> RF-6.5 y la versión anterior de esta sección. No afecta a *tenhou* ni a *chiihou*: un dealer puede
> completar su mano en la primera mano sin que la completen los otros tres. La decisión está argumentada
> en [`../specs/002/spec.md`](../specs/002/spec.md) §4 y RF-21.5.

### Fichas de riichi

- Declarar riichi resta **1000** al declarante y suma **1000** al bote de mesa. El pago **sí entra
  en los deltas del turno**, como −1000 del declarante: es lo que hace que la suma cuadre a cero
  salvoDeclaraciones y chombos, según RF-4.1. Si ese mismo turno se lleva el bote, el +1000 vuelve
  dentro del cobro del ganador y las dos partes se cancelan. Lo que no ocurre es que el pago vaya a
  **otro** jugador: si el bote no se reclama, esos 1000 quedan en la mesa y no los recibe nadie.
- Quien gana la mano se lleva **todo** el bote como un único monto. En un **ron múltiple** se lo lleva
  el ganador cuya mano vale más, con el asiento de menor número como desempate si dos valen lo mismo.
- El empate y la prolongación no adjudican el bote: sigue disponible para el turno siguiente.
- Un bote que no llega a reclamarse, porque la partida queda inconclusa o abortada, **se pierde**: esos
  1000 han salido ya de la puntuación de quien declaró y no vuelven a entrar en ninguna.

### Chombo

El abandono de un jugador durante la partida es una **penalización, no un final**. La mano queda
anulada: no se otorgan puntos de victoria ni de tenpai. En el turno en que se registra:

- Si el infractor **no es la localía**, recibe un delta de **−8000** y esos 8000 **se reparten**:
  **4000 al dealer** y **2000 a cada uno de los otros dos jugadores** que no son localía.
- Si el infractor **es la localía**, recibe un delta de **−12000** y esos 12000 **se reparten**:
  **4000 a cada uno de los tres rivales**.
- La penalización **se conserva**: sale de quien abandona y entra en los demás, así que la suma de los
  cuatro marcadores de la partida no baja de 100 000.
- La **localía no avanza** y el **contador de honba no se toca**: la mano siguiente se reparte desde el
  mismo estado. El chombo no es un renchan, porque no es una mano jugada.
- La partida **sigue abierta** y admite los turnos siguientes con normalidad.
- El abandono queda registrado en `results[].chombo` y se cuenta en `yakuStats.chombo`, y **solo** del
  jugador que lo provocó: los que cobran la penalización no cuentan como chombo.

### Bancarrota

Si tras aplicar los puntos de un turno algún jugador queda **por debajo de 0**, ese turno se aplica
íntegro y la partida **termina**: queda en estado `finalizada`, computa en el ranking con el saldo
negativo resultante y una marca de bancarrota en el resultado. El saldo negativo solo existe como
valor terminal; una partida en curso nunca tiene a un jugador en negativo.

---

## 3. Registro de un turno

Cada turno se persiste en `games/{gameId}/turns/{turnNo}` y es la unidad mínima de auditoría. No se
guarda el contenido de las fichas de la mano, sino lo necesario para **reconstruir** la puntuación
final y las estadísticas del jugador:

- `turnNo` — número de turno dentro de la partida, **correlativo y sin huecos**.
- `wind` — viento de la ronda.
- `dealerId` — localía del turno. **Derivado y guardado**: el sistema lo calcula a partir de los turnos
  anteriores en vez de leerlo del formulario.
- `honba` — contador de **manos que el dealer lleva ganando**. **Derivado y guardado**, y con efecto
  en el valor de la mano: cada contador añade 300 puntos.
- `resultType` — `tsumo` | `ron` | `ryuukyoku` | `chombo`. Un ron o tsumo puede tener varios
  ganadores; un chombo se registra siempre como `chombo` y nunca se combina con otro resultado.
- `yakuHan` — número de han aportados por yaku reales.
- `doraCount` — dora, *aka dora* y *ura dora* de la mano. Se suman a `yakuHan` para el cálculo.
- `yaku[]` — yaku que se hicieron y quién los obtuvo.
- `tenpai[]` — quién tiene tenpai. Obligatorio en empate y en prórroga; opcional en el resto.
- `riichiDeclaredBy[]` — quién ha declarado riichi **en este turno**.
- `riichiSticks` — fichas de riichi en el bote **después** de resolver este turno.
- `value[]` — resultado del motor por ganador: `{ playerId, han, fu, basicPoints, points, deltas }`.
- `deltas[]` — `{ playerId, delta }` para cada jugador que mueve puntos en el turno. Nunca un
  `Record`: con `noUncheckedIndexedAccess` el acceso indexado devuelve `number | undefined`.
- `capturedBy` — usuario que registró el turno.
- `isRenchan` — si la mano es repetición por *renchan*.
- `isFinalTurn` — si cierra la partida.

Los marcadores por turno se suman desde un valor inicial de **25 000** puntos por jugador, igual a
`games.startPoints`.

### Invariante de cuadre

La suma de los cuatro `deltas` de un turno **no es cero por construcción**. La forma exacta es:

```
Σ deltas = −(1000 × nº de riichi declarados en el turno que no llegan a reclamarse)
```

El bote de mesa sale del turno sin entrar en ningún `delta`, así que la validación de cuadre tiene que
usar esta fórmula y no una igualdad a cero. El bote que se reclama sí es neutro: sale del bote y entra
en el `delta` del ganador.

**El chombo no aparece en la fórmula** porque su penalización se reparte entre los demás jugadores:
sale del infractor y entra en los otros, y por eso es neutra en la suma. Antes, cuando los 8000 se
destruían, sí figuraba como un término propio.

---

## 4. Sistemas de puntuación

El club juega un único ruleset, stored en `games.ruleset` con el valor `mahjongSouls`. El campo
existe aunque solo haya uno disponible, para que el histórico siga siendo interpretable cuando se
añada un segundo reglamento.

### 4.1 Punto de partida y punto de retorno

| Concepto             | Valor   |
| -------------------- | ------- |
| `games.startPoints`  | 25 000  |
| Punto de retorno     | 30 000  |
| Uma por posición     | +30 / +10 / −10 / −30 |
| Atozuke              | **No se aplica**, nunca |
| Desempate en partida | Por asiento: Este, Sur, Oeste, Norte |
| Chombo               | −8 000, dentro del turno, no interrumpe la partida |

La puntuación final de un jugador es **marcador + uma**. El uma puntúa en la clasificación de
temporada: es lo que ordena la tabla, no el marcador bruto.

### 4.2 Motor de valor de mano

#### Fórmula

```
basicPoints = fu × 2 ^ (2 + totalHan)
totalHan    = yakuHan + doraCount
```

Se usa la forma equivalente `fu × 2^han × 4`, donde el multiplicador por han es `2^han` para 1 a 4 han
y la mano deja de escalar a partir de ahí. **Una mano necesita al menos un yaku real**: con
`yakuHan = 0` el turno se rechaza aunque tenga dora.

#### Pagos

| Situación                | Fórmula                          |
| ------------------------ | -------------------------------- |
| Ron de no dealer         | `basicPoints × 4`               |
| Ron de dealer            | `basicPoints × 6`               |
| Tsumo de no dealer       | cada no dealer paga `× 1`, el dealer paga `× 2` |
| Tsumo de dealer          | cada jugador paga `× 2`          |

#### Honba

Cada contador de honba añade **300 puntos**, repartidos con la misma estructura que un tsumo:

| Situación                | Honba por contador        |
| ------------------------ | ------------------------- |
| Ron                      | el descartador paga `300` |
| Tsumo de no dealer       | cada jugador paga `100`   |
| Tsumo de dealer          | cada jugador paga `100`   |

En los tres casos el total añadido es `300 × honba`, y por eso un tsumo de localía con honba 1 vale
exactamente lo mismo que el ron de la misma mano con honba 1. Los importes de honba son múltiplos
exactos de 100, así que **no se redondean**.

`honba` cuenta **las manos que el dealer lleva ganando**: sube en cada renchan y vuelve a cero en
cuanto la localía pasa a otro asiento. El valor de una mano no depende solo del as, sino de la racha del
dealer; ver la desviación 8 de §4.5.

#### Redondeo

**Cada pago se redondea hacia arriba a la centena más próxima, de forma independiente.** No se
redondea el total. Por eso el valor cobrado no coincide entre la misma mano jugada por ron y jugada
por tsumo: 1 han 30 fu paga 1000 por ron, pero 1100 por tsumo (500 + 300 + 300). Es correcto y no es
un defecto.

#### Precedencia de manos límite

Las manos límite **sustituyen** a la fórmula, no la recortan. La precedencia es:

1. Si hay un yaku de límite, o `totalHan ≥ 13`, la mano es **yakuman**: 8000 puntos básicos.
2. Si no, `totalHan` entre 6 y 12 → sanbaiman, baiman o haneman según la tabla.
3. Si no, `totalHan = 5`, o `totalHan = 4` con 40 fu o más, o `totalHan = 3` con 70 fu o más →
   **mangan**: 2000 puntos básicos.
4. En cualquier otro caso, la fórmula.

El tope de 2000 puntos básicos es **exclusivo de las manos de 5 han o menos**. Aplicarlo por encima
haría que una mano de 6 han valiese 8000 en vez de 18000.

| Mano límite | Han           | Básicos | Ron no dealer | Tsumo no dealer | Ron dealer | Tsumo dealer |
| ----------- | ------------- | ------ | ------------- | --------------- | ---------- | ------------ |
| Mangan     | 5, o 3-4 alto fu | 2 000  | 8 000         | 2 000 / 4 000   | 12 000     | 4 000        |
| Haneman    | 6-7           | 3 000  | 12 000        | 3 000 / 6 000   | 18 000     | 6 000        |
| Baiman     | 8-10          | 4 000  | 16 000        | 4 000 / 8 000   | 24 000     | 8 000        |
| Sanbaiman  | 11-12         | 6 000  | 24 000        | 6 000 / 12 000  | 36 000     | 12 000       |
| Yakuman    | 13+ o límite  | 8 000  | 32 000        | 8 000 / 16 000  | 48 000     | 16 000       |

#### Tabla de no dealer

| Han | Fu      | Ron       | Tsumo (no dealer / dealer) |
| --- | ------- | --------- | -------------------------- |
| 1   | 20      | N/A       | 200 / 400                  |
| 1   | 30      | 1 000     | 300 / 500                  |
| 1   | 40      | 1 300     | 400 / 700                  |
| 1   | 50      | 1 600     | 400 / 800                  |
| 1   | 60      | 2 000     | 500 / 1 000                |
| 1   | 70      | 2 300     | 600 / 1 200                |
| 2   | 20      | N/A       | 400 / 700                  |
| 2   | 25 chi  | 1 600     | N/A                        |
| 2   | 30      | 2 000     | 500 / 1 000                |
| 2   | 40      | 2 600     | 700 / 1 300                |
| 2   | 50      | 3 200     | 800 / 1 600                |
| 2   | 60      | 3 900     | 1 000 / 2 000              |
| 2   | 70      | 4 500     | 1 200 / 2 300              |
| 3   | 20      | N/A       | 700 / 1 300                |
| 3   | 25      | 3 200     | 800 / 1 600                |
| 3   | 30      | 3 900     | 1 000 / 2 000              |
| 3   | 40      | 5 200     | 1 300 / 2 600              |
| 3   | 50      | 6 400     | 1 600 / 3 200              |
| 3   | 60      | 7 700     | 2 000 / 3 900              |
| 3   | 70      | 8 000     | 2 000 / 4 000              |
| 4   | 20      | N/A       | 1 300 / 2 600              |
| 4   | 25      | 6 400     | 1 600 / 3 200              |
| 4   | 30      | 7 700     | 2 000 / 3 900              |
| 4   | 40 o más | 8 000     | 2 000 / 4 000              |

#### Tabla de dealer

| Han | Fu      | Ron       | Tsumo (cada uno paga) |
| --- | ------- | --------- | -------------------- |
| 1   | 20      | N/A       | 400                  |
| 1   | 30      | 1 500     | 500                  |
| 1   | 40      | 2 000     | 700                  |
| 1   | 50      | 2 400     | 800                  |
| 1   | 60      | 2 900     | 1 000                |
| 1   | 70      | 3 400     | 1 200                |
| 2   | 20      | N/A       | 700                  |
| 2   | 25 chi  | 2 400     | N/A                  |
| 2   | 30      | 2 900     | 1 000                |
| 2   | 40      | 3 900     | 1 300                |
| 2   | 50      | 4 800     | 1 600                |
| 2   | 60      | 5 800     | 2 000                |
| 2   | 70      | 6 800     | 2 300                |
| 3   | 20      | N/A       | 1 300                |
| 3   | 25      | 4 800     | 1 600                |
| 3   | 30      | 5 800     | 2 000                |
| 3   | 40      | 7 700     | 2 600                |
| 3   | 50      | 9 600     | 3 200                |
| 3   | 60      | 11 600    | 3 900                |
| 3   | 70      | 12 000    | 4 000                |
| 4   | 20      | N/A       | 2 600                |
| 4   | 25      | 9 600     | 3 200                |
| 4   | 30      | 11 600    | 3 900                |
| 4   | 40 o más | 12 000    | 4 000                |

`N/A` significa que la combinación **no es representable** y el turno con esa combinación se rechaza.
Las tres razones posibles, y el motor las distingue: los 20 fu solo existen por *pinfu*, que solo
produce 20 fu por tsumo porque por ron son 30, así que un ron de 20 fu es N/A; los 25 fu son
*chiitoitsu*, cuyo tsumo siempre lleva *menzen tsumo* y por tanto puntúa 3 han; y 70 fu o más solo se
alcanza con cuatro kans, que ya es yakuman.

#### Reglas de fu

| Situación                      | Fu    |
| ------------------------------ | ----- |
| Base de cualquier mano cerrada | 20    |
| *Chiitoitsu*                   | 25    |
| *Pinfu* por tsumo              | 20    |
| *Pinfu* por ron a mano cerrada | 30    |
| Ron a mano cerrada             | +10   |
| Tsumo                          | +2    |
| Triángulo cerrado              | +2    |
| Kan concealed                  | +2    |

#### Yaku de límite

Se reconocen trece: *kokushi musou*, *suukantsu*, *daisangen*, *shousuushii*, *daisuushii*,
*tsuuiisou*, *chinroutou*, *ryuuiisou*, *chuuren poutou*, *suucha riichi*, *sanchuurenhou*, *tenhou* y
*chiihou*. **Todos valen 8000 puntos básicos**: no existe doble ni triple yakuman, y cuatro riichi,
cuatro kan o cuatro vientos puntúan igual que un *kokushi musou*.

Una mano de **13 o más han** cuenta como yakuman aunque se haya construido solo con yaku normales y
sin ningún yaku de límite.

#### Dora

Dora, *aka dora* y *ura dora* **suman han** al valor de la mano, y cuentan para el umbral de yakuman.
No sustituyen a un yaku real: una mano con `yakuHan = 0` se rechaza aunque tenga 13 dora.

### 4.3 Reglaset M.League

No está disponible. `ruleset: 'mleague'` existe en el modelo para el futuro, pero una partida creada
con él **no admite captura de turnos**, porque no hay valores de uma calculados para él. Es la razón
de que el campo exista guardado aunque solo se ofrezca un ruleset.

### 4.4 No objetivo

El **double riichi** queda excluido del sistema: no se reconoce y una mano que lo incluye puntúa como
si solo tuviera riichi.

### 4.5 Desviaciones respecto del reglamento de referencia

El club no juega el reglamento de referencia tal cual. Estas desviaciones son deliberadas y el motor
las implementa **así**, no «por defecto»:

| # | Desviación                                                   | Efecto                                    |
| - | ------------------------------------------------------------ | ----------------------------------------- |
| 1 | No se aplica *kiriage mangan*                                | 4 han 30 fu y 3 han 60 fu valen 7700/11 600 |
| 2 | Los 30 000 puntos avertan pero no cierran la partida          | Se puede capturar más allá del umbral     |
| 3 | No se reconoce el *double riichi*                             | 1 han menos en esas manos                 |
| 4 | No existe doble yakuman                                       | Toda combinación de límite vale 8000      |
| 5 | El chombo no interrumpe la partida                            | La partida sigue y computa                |
| 6 | Se puede abandonar una partida inconclusa de forma terminal   | Sin retour en una partida de menos turnos  |
| 7 | El *pinfu* por ron son 30 fu, no 20 planos                    | Es la fila de 1 han 30 fu de la tabla     |
| 8 | El honba cuenta las manos que el dealer **gana**, no las que no | Sube en cada renchan y se pone a cero al perder la localía |

La desviación 7 es una **corrección del 2026-10-15**, no una regla heredada: las reglas del club no
decían qué pasaba con el *pinfu* ganado por ron, y ese dato faltaba. Queda escrita aquí y en
`domain/yaku.ts`, pero **el 30 fu todavía no es automático**: `computeFu` no tiene consumidor en
producción y el `fu` lo teclea quien captura. Hacerlo derivado es lo que queda pendiente.

La desviación 8 es una **inversión de sentido del 2026-10-15**, no una regla heredada: el contador
`honba` contaba hasta las pocas horas las **manos que el dealer no ganaba**, y el club confirmó que
cuenta las **manos que el dealer lleva ganando**. La consecuencia práctica es que la regla se reduce a
una frase: el contador **sube mientras el dealer conserva la localía y vuelve a cero en cuanto la
pierde**. Antes el empate con tenpai sumaba y la victoria del dealer no, de modo que haga falta separar
dos casos; ahora los dos hacen lo mismo. El tercer caso es el chombo, que conserva la localía pero
**no** sube el contador, así que necesita un resultado de mano propio.

Cada desviación tiene que estar cubierta por un test de `domain/` con su ejemplo numérico, porque
cambian puntos reales y no se detectan leyendo el histórico.

---

## 5. Agregados

Dos documentos derivados, ambos recalculados en cliente tras cada escritura de partida:

### `playerSeasonStats/{playerId}/stats/{seasonId}`

- `actualPoints` — suma de las **puntuaciones finales con uma** de todas las partidas finalizadas de
  la temporada. Puede ser negativa.
- `gamesPlayed` — número de partidas finalizadas.
- `victories` — ganadas en primera posición.
- `positions` — `{ '1st': n, '2nd': n, '3rd': n, '4th': n }`. Las claves son unions de literales.
- `yakuStats` — contadores acumulados: `riichi`, `dora`, `kan`, `tsumo`, `ron`, `chombo`,
  `haiteiRaoyue`, `rinshanKaihou`, `yakuman`.

`yakuman` cuenta **manos ganadas con al menos un yaku de límite o con 13 o más han**, no yaku de
límite: como no hay doble yakuman, una mano con cuatro yaku de límite suma 1.

`chombo` se incrementa en la partida en la que ocurrió. Como la partida con chombo **computa**, no hace
falta ningún mecanismo de supervivencia para el contador.

### `rankings/{seasonId}/players/{playerId}`

Puntuación acumulada del jugador en la temporada (`points`, **con uma**), partidas jugadas
(`gamesPlayed`) y su posición en la clasificación (`rank`).

El desempate en la clasificación es único y en este orden: **victorias**, luego **veces en segunda**,
luego orden alfabético por nombre. Es el mismo en todas las temporadas, que es lo que las hace
comparables.

### Conservación de los puntos

El total de una partida es 100 000 más o menos, y hay **un solo** motivo por el que no lo es:

- **Bote de riichi no reclamado**: −1 000 por cada ficha declarada en una partida que no llega a
  reclamarse.

El chombo **ya no figura aquí**: su penalización se reparte entre los demás jugadores, así que sale de
quien abandona y entra en los otros, y la suma de los cuatro marcadores se conserva. Antes sí era un
motivo, con −8 000 por cada abandono.

Una temporada con partidas finalizadas sin riichi sin reclamar conserva 100 000 por partida.

---

## 6. Referencia rápida

| Concepto                    | Dónde vive                        |
| --------------------------- | --------------------------------- |
| Tipos de entidad            | `domain/types.ts`                 |
| Reglas de mano y rondas     | `domain/rules.ts`                 |
| **Valor de mano**           | `domain/handValue.ts`             |
| Uma y reglas de ruleset     | `domain/uma.ts`                   |
| Puntuación de temporada     | `domain/ranking.ts`               |
| Agregación de estadísticas  | `domain/stats.ts`                 |
| Recálculo de derivados      | `domain/stats/recalculate.ts`     |
