# plan.md — Plan técnico de `specs/003`

Plan de la mesa en la pantalla de captura y de los tres huecos que dejó 002, a partir de
[`spec.md`](spec.md). Este documento define **cómo** se construye; la spec define **qué** se construye.
Las rutas de este documento son relativas a `specs/003/`.

| Documento | Papel |
| --------- | ----- |
| [`../../docs/constitution.md`](../../docs/constitution.md) | Principios no negociables. Se cita como `N.M`. |
| [`spec.md`](spec.md) | 25 requisitos en RF-24 a RF-30, 8 RNF heredados, 15 casos límite, 21 criterios de finalización y 9 dudas resueltas. |
| [`../../docs/domain.md`](../../docs/domain.md) | Reglas de puntuación. La tabla del modal vive aquí (§4.2). |
| [`../../docs/reviews/003-qa.md`](../../docs/reviews/003-qa.md) | Traza de los 17 hallazgos y dónde se cerraron. |
| [`../../AGENT.md`](../../AGENT.md) | Convenciones de software. Este plan no puede contradecirlas. |
| `plan.md` | Este documento. |

---

## 1. Alcance y forma de trabajo

Se construye **la mesa que la pantalla todavía no muestra** —25 requisitos en siete bloques— más tres
huecos de 002 que este plan asume. El orden no es libre y cuatro reglas lo imponen:

- **La condición de 003: `src/domain/` no se toca.** No es una preferencia, es lo que hace que 003 sea
  una spec pequeña. Si una fase necesita escribir en el dominio, esa fase está mal planteada.
- **RF-24.3 y RF-24.4 dependen de 002.** La localía y el viento los lleva el sistema desde `nextHand`.
  003 los pinta; no los calcula.
- **RF-19.8 sí escribe en `data/`**, porque es una proyección pura de un registro y `turns.repository.ts`
  ya tiene tres iguales: `capturedTurnOf`, `toTurnSnapshot` y `TURN_PATCH_FIELDS`. No es dominio, así que
  no rompe la condición anterior.
- **Constitution III.1**: los cuatro en verde al terminar cada tarea, en orden.

`../../docs/constitution.md` **no se toca**: ningún principio necesita enmienda. Ninguna dependencia se
añade, así que `../../AGENT.md` → Rules se respeta sin excepción (II.1, II.2).

### 1.1 · La puerta de cierre que 003 sí tiene

`specs/002/plan.md` §1 recuerda que `rules.test.ts` pasó meses saltándose sin que nadie lo notara. 003
tiene el riesgo simétrico: **una puerta que no muerde es peor que ninguna**, porque da verde siempre.

La puerta de constitution IV.1 —100 % de `src/domain/`— **no puede ser la de 003**, porque 003 no escribe
en `domain/` y el umbral se conserva solo. Copiarla sería un criterio vacío.

La puerta de 003 es doble:

| Puerta | Cómo se mide | Qué impide |
| ------ | ------------ | ----------- |
| **`src/domain/` congelado** | `git diff --name-only src/domain` tiene que estar vacío | Que una fase «un día de estos» crezca un módulo puro por comodidad |
| **Un test por comportamiento de pantalla** | Cada RF de §4 tiene al menos un test de componente | Que se añada un comportamiento sin comprobar |

La presión se traslada de *cuánto cubre el código puro* a *cuántos comportamientos de pantalla están
comprobados*, que es la pregunta que 003 tiene que responder. Y como `domain/` no se toca, el 100 % de
constitution IV.1 se mantiene **como efecto colateral y no como criterio**: si algún día bajara, no
significa que 003 lo rompió.

---

## 2. Orden de ejecución

| Fase | Bloque | Dónde | Por qué aquí y no antes |
| ---- | ------ | ----- | ---------------------- |
| **0** | Cerrar los huecos de 002 · RF-30 | `turns.repository.ts`, tests | **Primero, porque son baratos y porque RF-30.1 es lo único de 003 que escribe fuera de la interfaz.** RF-30.4 y RF-30.5 son **tests que faltan** y se escriben antes de que haya más superficie que probar. Cerrar las deudas antes de añadir superficie sale más barato que encontrarlas después |
| **1** | RF-24 · la mesa en la captura | `TurnForm.vue` | **Es el 70 % del valor de 003 y va entero en una fase.** Los cuatro requisitos tocan el mismo `computed` de la mesa y el mismo fichero; separarlos en cuatro fases produciría cuatro commits que rompen el mismo archivo (`plan.md` §5.2, decisión 6) |
| **2** | RF-25 · capturar sin buscar | `TurnForm.vue` | El buscador de yaku **depende de la lista plana que ya existe** y el riichi horizontal es una clase. Fase corta a propósito |
| **3** | RF-26 · leer el resultado | `GameDetailPage.vue` | El detalle ya importa `BaseDialog`, así que el andamiaje está |
| **4** | RF-27 · jugadores activos | `GameForm.vue` | Va antes de la ayuda porque es el único requisito que toca una **decisión vigente de 001** —RF-2.9—, y conviene resolverlo cuando el resto de la interfaz ya está verde |
| **5** | RF-28 · ayuda y referencia | `HelpModal.vue`, nuevo · `es.ts` | Es la única fase que **crea componente** y la única que depende de un fichero del club |
| **6** | RF-29 · abortar deja inconclusa | `GameDetailPage.vue`, `es.ts` | Son dos cadenas de i18n y un nombre de botón. Va al final porque es lo más pequeño y lo que más se nota si está mal |
| **7** | Checklist de salida | todo | Igual que la fase 8 de 002: comprueba la spec **por fuera**, no por dentro |

**Por qué RF-29 va al final y no primero.** Es el requisito que el club pidió por nombre y el que
más se nota si está mal —la palabra del botón—. Pero **toca dos cadenas y ningún cálculo**: hacerlo
primero dejaría el resto del trabajo encima de un cambio de redacción que se puede revertir en un
segundo. Al final, si algo va mal, es lo primero que se revisa.

**Por qué RF-27 va antes que RF-28.** Es la única fase que puede **romper un requisito de 001**. El
filtro de jugadores no es una mejora de Cosmética: si esconde a quien ya está en otra partida abierta,
deja de cumplir RF-2.9. Ponerla con el resto de la interfaz verde y con la ayuda después deja margen
para detectar el fallo en la revisión.

### 2.1 · Lo que la fase 5 tiene bloqueado

`spec.md` §8 declara la ruta `src/assets/tabla-puntuacion.png` y la marca **pendiente de que el club la
aporte**. Mientras no exista:

- **RF-28.4 y el criterio 25 no se pueden cumplir**, y no es culpa del código.
- El test de RF-28.4 **no se puede escribir** sin el fichero.

El plan no pone un sustituto. Una tabla de puntuación inventada en el hueco de la del club sería peor que
un build roto, porque **daría números falsos con buena pinta**. Se escribe el test de RF-28.3 —el del
markdown, que no depende del club— y RF-28.4 queda declarado como bloqueado.

---

## 3. Módulos

### 3.1 `domain/` — **no se toca**

Ninguna fase escribe aquí. Es una condición, y §1.1 la convierte en puerta de cierre.

### 3.2 `data/` — una función pura nueva

| Módulo | Qué añade | RF |
| ------ | --------- | -- |
| `turns.repository.ts` | `capturedFieldsBefore(turn)`: los valores que tenían los campos **capturados** antes de la última corrección, leídos de la entrada más reciente del registro. Puro, como `capturedTurnOf` y `toTurnSnapshot`, que ya viven aquí | RF-30.1 |

No hay campo nuevo, ni documento nuevo, ni cambio de escritura. `turns.repository.ts` **no crece** en
API de escritura: solo una proyección de lectura.

### 3.3 `composables/` — **no cambian**

Ni `useGameTurns`, ni `useGames`, ni `usePlayers`. Todo lo que 003 necesita ya está disponible:
`nextHand` trae el estado derivado, `scores` ya se calcula en `TurnForm.vue:52-59`, y `GameForm.vue`
ya tiene `seatPlayer`.

### 3.4 `components/` y `pages/`

| Pieza | Qué cambia | RF |
| ----- | ---------- | -- |
| `forms/TurnForm.vue` | La mesa —nombres, deltas con color, marca de localía, viento por asiento—; el buscador de yaku; el riichi horizontal | RF-24.1 a RF-24.4, RF-25.1, RF-25.2 |
| `turns/HelpModal.vue` · **nuevo** | Modal de ayuda, con el contenido desde el markdown | RF-28.1, RF-28.2 |
| `ui/BaseDialog.vue` | **No cambia.** Ya tiene `role="dialog"`, `aria-modal`, `aria-label` y cierre con Escape (`BaseDialog.vue:8-41`) | — |
| `pages/GameDetailPage.vue` | La diferencia de puntos al hacer clic; el botón y su aviso | RF-26.1, RF-26.2, RF-29.1, RF-29.2 |
| `forms/GameForm.vue` | El filtro de jugadores, que **no oculta** | RF-27.1 a RF-27.3 |
| `layout/`, `charts/`, `pages/StatsPage`, `pages/RankingsPage`, `pages/GamesPage` | **No cambian** | — |

El **markdown de la ayuda** vive en `src/docs/ayuda-turnos.md` y se importa con `?raw`.
`src/vite-env.d.ts` referencia `vite/client`, que ya declara ese tipo, así que **typecheck lo acepta sin
tocar el fichero**.

---

## 4. Modelo de datos

**No hay ninguno.** Es la primera tabla de este plan que está vacía, y es lo que hace que 003 sea
pequeña.

Sin campo nuevo. Sin documento nuevo. Sin índice compuesto nuevo. Sin cambio de escritura.
Sin cambio de `firestore.rules`.

La tabla de la imagen —`src/assets/tabla-puntuacion.png`— es un **asset**, no un documento: no se sube a
Firestore ni entra en el modelo. Se declara su ruta en `spec.md` §8 porque borrarla tiene que romper el
build, y eso se consigue con un import, no con una regla.

---

## 5. Decisiones justificadas con la alternativa descartada

### 5.1 Decisiones de datos y dominio

| # | Decisión | Alternativa descartada | Por qué |
| - | -------- | --------------------- | ------- |
| 1 | La versión anterior de un turno se reconstruye **restituyendo los capturados del registro y recalculando los derivados** | Deshacer el campo a campo, aplicando `from` a **todos** los campos del registro | Un `from` de un campo derivado es real y está escrito, así que *se podría* aplicar. Pero RF-18.13 de 002 dice que los derivados los recalcula el sistema, y meter un valor calculado como si fuera capturado rompe esa regla **en el mismo cambio que la cumple**. Además, el `from` derivado era el de una partida que ya no existe: los turnos anteriores pudieron cambiar después |
| 2 | `capturedFieldsBefore` devuelve **solo capturados** | Devolver todos los campos y que el llamador decida | Una función que devuelve de más deja la decisión al pie de la llamada, y el pie de la llamada es donde el error se cuela. Que devuelva exactamente lo que RF-30.1 dice |
| 3 | Vive en `data/turns.repository.ts` | En `domain/`, que es donde vive el cálculo | No es cálculo: es una proyección de un documento, y `toTurnSnapshot` ya está ahí por el mismo motivo. Además, ponerla en `domain/` rompería la condición de §1 |
| 4 | El filtro de jugadores **no oculta** a los inactivos, los lista después marcados | Ocultarlos, que es lo que «filtro» sugiere literalmente | Un club entero dado de alta se queda **sin candidatos** y no puede crear partida —el caso límite 7 de la spec—. Y RF-2.9 de 001 permite repetir jugador entre partidas abiertas, así que un filtro que lo escondiera rompería un requisito vigente |

### 5.2 Decisiones de estructura de código

| # | Decisión | Alternativa descartada | Por qué |
| - | -------- | --------------------- | ------- |
| 5 | El texto de la ayuda vive en **un `.md` importado con `?raw`** | Duplicarlo en una plantilla de `es.ts` | Dos fuentes para el mismo texto es el problema que 003 viene a arreglar en todas partes. Con `?raw` hay una sola, y el test de RF-28.3 la comprueba contra el disco |
| 6 | `TurnForm.vue` se toca **entero en una fase** | Cuatro fases, una por requisito de RF-24 | Los cuatro requisitos comparten el mismo `computed` de la mesa y el mismo fichero. Cuatro fases producen cuatro commits que rompen el mismo archivo, y el `git diff` de la revisión se vuelve ilegible |
| 7 | El botón dice **«abortar»** y el resultado **«inconclusa»** | «Abandonar partida», que es lo que hay hoy | Decisión del club (`spec.md` §9, duda 2). Se acepta el coste: «abortar» y `aborted` dejan de ser sinónimos, y de ahí que RF-29.3 exista |
| 8 | El aviso dice «inconclusa» y **no** «abortada» | Dejar el aviso actual | Miente: `transition('abandon')` devuelve `unfinished` (`domain/game.ts:107`), que se pinta como «Inconclusa» (`es.ts:251`). El aviso anuncia un estado al que esa transición nunca llega |
| 9 | La puerta de 003 es **`domain/` congelado** + test por comportamiento | Reutilizar la de constitution IV.1 | No puede ser: 003 no escribe en `domain/` y el umbral se conserva solo. Sería un criterio verde siempre (`003-qa.md`, hallazgo C1) |
| 10 | La diferencia de puntos se calcula **en el componente** | En `domain/game.ts`, como la uma | La uma es una regla del reglamento con valor propio; la diferencia de puntos contra cada rival es una **resta entre dos marcadores que ya están en pantalla**. Meterla en `domain/` la convertiría en un RF de dominio y obligaría a testearla al 100 % sin ganar nada |

---

## 6. Estrategia de tests

### 6.1 Niveles y umbrales

| Nivel | Qué cubre | Umbral |
| ----- | --------- | ------ |
| `src/__tests__/fixtures/ayuda.md` | El documento que se muestra en el modal, comparado con el que pinta la interfaz | — |
| `src/__tests__/TurnForm.test.ts` | RF-24, RF-25, RF-30.6 | Sin umbral, se reporta |
| `src/__tests__/GameDetailPage.test.ts` | RF-26, RF-29 | Sin umbral, se reporta |
| `src/__tests__/GameForm.test.ts` | RF-27 | Sin umbral, se reporta |
| `src/__tests__/HelpModal.test.ts` | RF-28.1 a RF-28.3 | Sin umbral, se reporta |
| `src/__tests__/turns.repository.test.ts` | RF-30.1 a RF-30.3, RF-30.5 | Sin umbral, se reporta |
| `src/__tests__/determinismo.test.ts` | RF-30.4 | Sin umbral, se reporta |
| `src/__tests__/modalTabla.test.ts` | RF-28.4 — **bloqueado** hasta que el club aporte la imagen | — |

**El único umbral bloqueante de 003 es `src/domain/` sin cambios**, y se mide con `git diff`, no con un
porcentaje. Todo lo demás se reporta.

### 6.2 Los barridos que más valor dan

Son tests de invariante, no de ejemplo:

| `describe` | Qué barre | Por qué |
| --------- | --------- | ------- |
| `TurnForm.test.ts` → `'la mesa'` | Cada estado de partida —sin turnos, con un turno, tras corregir— × los cuatro asientos | La mesa cambia con el estado derivado, y un ejemplo suelto no lo encuentra |
| `TurnForm.test.ts` → `'color del delta'` | Delta positivo, cero y negativo × **los dos signos** | El cero es el caso que se olvida: un empate repartido deja a alguien con delta cero y ese jugador **no** va en ningún color |
| `TurnForm.test.ts` → `'marcador de localía'` | Los cuatro asientos, con la localía **fuera del Este** | Es el discriminante. Con la localía en Este, una etiqueta pintada desde el asiento Este daría razón correcta y el test pasaría (`003-qa.md`, C5) |
| `determinismo.test.ts` → `'gameLength'` | La misma secuencia de turnos en `tonpuusen` y en `hanchan`, con más de cuatro manos | Es RF-30.4 entero, y es la mitad de RF-18.20 que faltaba |
| `GameForm.test.ts` → `'jugadores candidatos'` | Todos activos · ninguno activo · activos y inactivos mezclados · el mismo jugador ya en otra partida abierta | Los tres últimos son los que rompen: el club sin activos, y el aviso de RF-2.9 |

### 6.3 El test que lee el disco

RF-28.3 exige comparar el markdown del repositorio con lo que la interfaz pinta. El patrón ya existe:
`handValue.test.ts:302` lee `docs/domain.md` con `node:fs` y `parseTable` y **comprueba que el motor
coincide con el documento**.

003 replica el patrón en vez de inventar otro:

```ts
const enDisco = readFileSync(fileURLToPath(new URL('../docs/ayuda-turnos.md', import.meta.url)), 'utf8')
expect(wrapper.text()).toContain(enDisco.replace(/^#+ .*$/gm, '').trim().slice(0, 80))
```

El criterio es que **el texto de la interfaz no puede dejar de ser el del fichero**. Si alguien edita
uno y no el otro, el test falla.

### 6.4 Verificación por tarea

Al terminar cada tarea, los cuatro en verde y en este orden (constitution III.1):

```
npm run typecheck && npm run lint && npm run test && npm run format:check
```

Y al terminar **cada fase**, `git diff --name-only src/domain` tiene que estar vacío.

---

## 7. Trazabilidad RF → módulo → test

| RF | Módulo | Test |
| -- | ------ | ---- |
| RF-24.1 | `TurnForm.vue` | `TurnForm.test.ts` → `'la mesa'` |
| RF-24.2 | `TurnForm.vue` | `TurnForm.test.ts` → `'color del delta'` |
| RF-24.3 | `TurnForm.vue` | `TurnForm.test.ts` → `'marcador de localía'` |
| RF-24.4 | `TurnForm.vue` | `TurnForm.test.ts` → `'la mesa'` |
| RF-25.1 | `TurnForm.vue` | `TurnForm.test.ts` → `'buscador de yaku'` |
| RF-25.2 | `TurnForm.vue` | `TurnForm.test.ts` → `'captura sin buscar'` |
| RF-26.1, RF-26.2 | `GameDetailPage.vue` | `GameDetailPage.test.ts` → `'diferencia de puntos'` |
| RF-27.1 a RF-27.3 | `GameForm.vue` | `GameForm.test.ts` → `'jugadores candidatos'` |
| RF-28.1 a RF-28.3 | `HelpModal.vue` + `?raw` | `HelpModal.test.ts` + el test que lee el disco |
| RF-28.4 | `modalTabla.test.ts` | **bloqueado** hasta que el club aporte la imagen |
| RF-28.5 | `TurnForm.vue` | `TurnForm.test.ts` → `'el borrador sobrevive a los modales'` |
| RF-29.1 a RF-29.3 | `GameDetailPage.vue` + `es.ts` | `GameDetailPage.test.ts` + `locales.test.ts` |
| RF-30.1 a RF-30.3 | `turns.repository.ts` | `turns.repository.test.ts` → `'versión anterior de un turno'` |
| RF-30.4 | — | `determinismo.test.ts` → `'gameLength'` |
| RF-30.5 | — | `turns.repository.test.ts` → `'sin campo de motivo'` |
| RF-30.6 | `TurnForm.test.ts` | el nombre del test, leído por el propio test |

---

## 8. Checklist de salida

| # | Condición | Origen |
| - | --------- | ------ |
| 1 | Los cuatro comandos en verde, en orden | Constitution III.1 |
| 2 | **`src/domain/` sin cambios**, verificado con `git diff` | `plan.md` §1.1 |
| 3 | Cada RF de §4 con al menos un test de componente | `plan.md` §6.1 |
| 4 | El texto de la ayuda coincide con el markdown del disco | RF-28.3 |
| 5 | La imagen de la tabla existe en la ruta declarada | RF-28.4 |
| 6 | El test del color del delta cubre **el cero** | `plan.md` §6.2 |
| 7 | El marcador de localía se fija con la localía **fuera del Este** | RF-24.3 |
| 8 | Ninguna pantalla dice «abortada» para el estado `unfinished` | RF-29.2, RF-29.3 |
| 9 | El filtro de jugadores no oculta y no bloquea | RF-27.1 a RF-27.3 |
| 10 | `gameLength` no cambia el resultado del recorrido | RF-30.4 |
| 11 | La versión anterior no restaura campos derivados | RF-30.2 |
| 12 | La captura sin conexión sigue declarada fuera de alcance | `spec.md` §7 |

---

## 9. Riesgos y cómo se mitigan

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| La imagen de la tabla no la aporta el club | RF-28.4 y el criterio 5 no se cumplen | Declarado bloqueado en §2.1, **no** sustituido por una tabla inventada. Una tabla falsa con buena pinta es peor que un build roto |
| La marca de localía se pinta desde el asiento Este | Razón equivocada a quien juegue a partir del segundo turno, **sin que ningún test de motor salte** | El barrido `'marcador de localía'` recorre los cuatro asientos y fija el caso Sur. Es el discriminante, y por eso existe |
| El filtro de jugadores deja la partida sin candidatos | Un club con todos dados de baja no puede jugar | Caso límite 7, barrido `'jugadores candidatos'` con «ningún jugador activo» |
| «Abortar» y `aborted` se confunden en pantalla | La interfaz dice dos cosas distintas a la vista | RF-29.3 y el criterio 8: ninguna pantalla usa «abortada» para `unfinished` |
| El texto de la ayuda driftar del markdown | El club arregla el documento y la pantalla sigue igual | RF-28.3, el test que lee el disco. Es el mismo patrón que ya usa `handValue.test.ts` |
| Una fase toca `domain/` «solo un momento» | Se rompe la condición que hace pequeña a 003, y el 100 % deja de ser efecto colateral | La condición 2 de §8 lo comprueba **al terminar cada fase**, no al final |
| `?raw` no llega al build de producción | Los tests pasan y la aplicación sale sin el texto | La fase 5 comprueba `npm run build`, no solo los tests. Typecheck no lo detecta |
| La versión anterior se aplica sobre turnos que ya cambiaron | Un turno «restaurado» que no es el que hubo | RF-30.2 y RF-30.3: los derivados **no** salen del registro, se recalculan desde el recorrido |

---

## 10. Lo que este plan no cubre

- **004 · Verificación de la mano.** El indicador de dora y las fichas siguen sin capturarse, y
  RF-22.7 sigue confiando en lo que pone quien captura.
- **005 · Reglaset M.League.** `ruleset: 'mleague'` sigue sin admitir captura.
- **El final de una ronda.** RF-18.21 de 002 lo declara no modelado.
- **La captura sin conexión por test.** `docs/reviews/002-red.md` lo declaró inalcanzable y nada ha
  cambiado. 003 hereda la deuda y no puede pagarla.
- **Los huecos de 002 que 003 NO asume.** El rastreo RF a RF dejó tres y los tres entran (RF-30). No
  queda ninguno abierto.
- **La megalomanía de rehacer el formulario.** 003 añade señales a lo que hay. Si una fase empieza a
  reordenar campos, está fuera de alcance.

---

## Anexo · Cambios que este plan obliga a hacer en `../../AGENT.md`

Cuatro cambios, todos pequeños y ninguno de estructura:

| Fichero | Cambio | Por qué |
| ------- | ------ | ------- |
| `AGENT.md` → Comandos | Ninguno | `?raw` y las imágenes los resuelve Vite; no hay script nuevo |
| `AGENT.md` → Data model | Ninguno | 003 no añade campo ni documento |
| `AGENT.md` → Tests | Añadir que la puerta de una spec que **no toca `domain/`** es otro, y que se mide con `git diff` | Es la lección del hallazgo C1 y del `rules.test.ts` que pasó meses saltándose. Sin escribirlo, la siguiente especificación de interfaz copia la puerta vacía |
| `AGENT.md` → Reglas de seguridad | Ninguno | `firestore.rules` no se toca |