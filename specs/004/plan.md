# plan.md — Plan técnico de `specs/004`

Plan del contexto de mano por ganador, el multi-ron, el borrado de turno, el nombre en inglés de los yaku
y el rediseño del aplicativo, a partir de [`spec.md`](spec.md). Este documento define **cómo** se
construye; la spec define **qué** se construye. Las rutas de este documento son relativas a `specs/004/`.

| Documento | Papel |
| --------- | ----- |
| [`../../docs/constitution.md`](../../docs/constitution.md) | Principios no negociables. Se cita como `N.M`. |
| [`spec.md`](spec.md) | 32 requisitos en RF-31 a RF-37, 8 RNF heredados, 23 casos límite, 29 criterios de finalización y 19 dudas resueltas. |
| [`../../docs/domain.md`](../../docs/domain.md) | Reglas de puntuación. No cambian en 004. |
| [`../../docs/especificaci_n_de_estilos_ui_ux.md`](../../docs/especificaci_n_de_estilos_ui_ux.md) | El sistema de diseño «Neo-Sheng / Dark Modern». |
| [`../../docs/reviews/004-qa.md`](../../docs/reviews/004-qa.md) | Traza de los 28 hallazgos y dónde se cerraron. |
| [`../../AGENT.md`](../../AGENT.md) | Convenciones de software. Este plan no puede contradecirlas. |
| `plan.md` | Este documento. |

---

## 1. Alcance y forma de trabajo

Se construyen **cuatro bloques** —el modelo de la mano y el multi-ron, el borrado de turno, el inglés de
los yaku y el rediseño— más el cierre de las deudas que 001, 002 y 003 dejaron con nombre. El orden no es
libre y cinco reglas lo imponen:

- **La condición de 004: sí se toca `src/domain/`.** Es lo contrario de 003, y es el hallazgo bloqueante
  `A1` de [`004-qa.md`](../../docs/reviews/004-qa.md). El contexto de la mano no está persistido y el
  desglose es por turno; las dos cosas exigen tocar el motor y el modelo.
- **Constitution IV.1 y IV.2 vuelven a morder.** Como 004 **sí** escribe en `domain/`, el 100 % de
  cobertura es bloqueante otra vez, y toda función pura nueva se escribe con su test.
- **RF-18.13**: los campos capturados no se re-derivan. El contexto de mano y el desglose por ganador son
  **captura**, así que viajan como captura y nunca entran en la lista de campos derivados de una
  corrección.
- **RF-32.5 y RF-37.3**: solo los turnos **nuevos** usan la forma por ganador. Nada se migra. Los campos
  nuevos son **opcionales**, con el patrón que ya usan `yakuHanOverride` y `audit` para los turnos
  escritos antes de `specs/002`.
- **Constitution III.1**: los cuatro en verde al terminar cada tarea, en orden.

`../../docs/constitution.md` **se toca**: la enmienda de dependencias que exige II.2, por la librería de
búsqueda con etiquetas de RF-35.5 (ver §10). Ninguna otra regla cambia.

### 1.1 · La puerta de cierre que 004 vuelve a tener

003 aprendió —y lo dejó escrito en `../../AGENT.md` → Tests— que **una puerta que no muerde es peor que
ninguna**, porque da verde siempre. 003, al no tocar `domain/`, tuvo que inventar una puerta
(`git diff src/domain` vacío + test por comportamiento).

004 es el caso simétrico: **vuelve a tocar `domain/`**, así que **la puerta de 003 es ilegal aquí** (no
puede estar vacía, porque tiene que haber cambios) y **la de constitution IV.1 vuelve a morder**. La
puerta de 004 es:

| Puerta | Cómo se mide | Qué impide |
| ------ | ------------ | ---------- |
| **Cobertura de `src/domain/` al 100 %** | `npm run test` con el umbral de constitution IV.1 | Que el contexto por ganador entre en el motor sin cubrir sus ramas |
| **`git diff src/domain` con cambios declarados** | El diff solo puede tocar lo que §0 de la spec declara | Que una fase toque el dominio «de paso» por algo que la spec no autoriza |
| **La suite entera verde** | Los 848+ tests existentes siguen pasando | Que el cambio de esquema rompa un invariante que ya estaba comprobado (RF-36.2) |

La diferencia con 003 es que la primera fila **es un umbral real**, no un efecto colateral: si el motor
gana una rama y no tiene test, 004 **falla**.

---

## 2. Orden de ejecución

| Fase | Bloque | Dónde | Por qué aquí y no antes |
| ---- | ------ | ----- | ---------------------- |
| **0** | El modelo: contexto de mano y desglose por ganador · RF-31, RF-32, RF-37 | `domain/handValue.ts`, `domain/turn.ts`, `domain/replay.ts`, `data/turns.repository.ts` | **Primero, porque todo lo demás depende de él.** El formulario, el detalle y la lectura no pueden capturar ni pintar un contexto que el modelo no sabe guardar. Va con tests de motor antes de que haya interfaz que dependa de ella |
| **1** | La captura del contexto y del multi-ron · RF-31, RF-32 | `TurnForm.vue` | Después del modelo: consume lo que la fase 0 dejó. Toca el mismo `computed` de la mesa y el mismo fichero, así que va entero en una fase (`plan.md` §5.2, decisión 8) |
| **2** | Borrar y re-capturar el turno · RF-33 | `GameDetailPage.vue`, `es.ts` | La capacidad **ya existe** (`deleteTurn`); esta fase es la pantalla que faltaba. Va después del modelo porque el borrado re-deriva, y conviene que el modelo esté estable antes |
| **3** | El nombre en inglés de los yaku · RF-34 | `es.ts`, `TurnForm.vue` | Es i18n y las cuatro superficies donde se pinta un yaku. Va después de la captura porque dos de esas superficies son la nueva casilla por ganador y el selector |
| **4** | Tokens, tipografía y componentes base · RF-35.1, RF-35.2, RF-35.8, RF-36 | `src/styles/main.css`, `BaseButton.vue`, `BaseDialog.vue`, `layout/` | El rediseño empieza por **el tema y las piezas compartidas**, porque el resto de las pantallas los usan. Sin esta fase, cada pantalla se rediseña dos veces |
| **5** | Rediseño por pantalla · RF-35.3 a RF-35.11 | `pages/` y `components/` | Consume la fase 4. Recorre **todas** las pantallas, no solo las cuatro del documento |
| **6** | Checklist de salida y enmiendas | todo | Igual que la fase 7 de 003 y la 8 de 002: comprueba la spec **por fuera**, y deja escritas las enmiendas de dependencias y de `AGENT.md` |

**Por qué el modelo va primero y no después.** Es la lección del hallazgo `A3`: si la interfaz se
construye contra un modelo que no guarda el contexto, el trabajo se tira. La fase 0 fija el contrato
—`HandValueInput`, `TurnWinnerInput`, `CapturedTurn`, `TurnRecord`— y las fases 1 a 3 lo consumen.

**Por qué el borrado va antes que el inglés.** El borrado re-deriva la partida con los turnos que
sobreviven; si el modelo per-ganador de la fase 0 tiene un fallo de re-derivación, el borrado lo destapa
en un caso real —borrar y volver a capturar— mejor que un test aislado. Va antes de que el rediseño
empiece a mover pantallas.

**Por qué el rediseño va al final.** Es el bloque más grande y el que **no cambia comportamiento**, solo
aspecto. Los requisitos funcionales de las fases 0 a 3 tienen que estar verdes antes de mover clases y
colores por medio aplicativo: así, si un test rojo aparece durante el rediseño, se sabe que es de aspecto
y no de lógica (RF-36.2).

### 2.1 · Lo que la fase 4 tiene bloqueado

La dependencia de búsqueda con etiquetas de RF-35.5 **no está en el repositorio**. La fase 4 escribe su
enmienda, pero **si la dependencia no se puede fijar** contra el stack de la constitución —`typescript
~5.9.3`, `vue 3.5.43`, `vite 8.3.2`, Node `^22.12\|^24\|>=26`—, entonces RF-35.5 y el criterio 41 quedan
**declarados bloqueados** y el rediseño del selector de yaku se pospone a la fase 5 con el control actual
mejorado. **No se sustituye por una dependencia sin `peerDependencies` comprobados** (§1, regla 5).

---

## 3. Módulos

### 3.1 `domain/` — **sí se toca**, y es la fase 0

| Módulo | Qué añade | RF |
| ------ | --------- | -- |
| `handValue.ts` | `HandValueInput` recibe el contexto de la mano (`isClosedHand`, `hasKan`) o un derivado; `YakuContext` se construye desde él, no desde constantes | RF-31.3 a RF-31.5 |
| `turn.ts` | `TurnWinnerInput.hand` lleva el contexto; `TurnInput` de un ron con varios ganadores lleva un desglose por ganador | RF-31.7, RF-32.1 |
| `replay.ts` | `CapturedTurn` guarda el contexto y, en ron múltiple, el desglose por ganador, para que la re-derivación lo reproduzca | RF-31.7, RF-37.1 |
| `yaku.ts` | **No cambia la regla.** `HAS_KAN` y `NO_KAN` ya existen (`:185-186`); solo pasan a recibir un contexto real | — |

El dominio es puro: no conoce el formulario ni Firestore. El contexto entra como parámetro, igual que hoy
entra `HandValueInput`.

### 3.2 `data/` — el documento del turno y su compatibilidad

| Módulo | Qué añade | RF |
| ------ | --------- | -- |
| `turns.repository.ts` | `TurnRecord` gana los campos opcionales del contexto y del desglose por ganador; `CreateTurnInput`, `UpdateTurnPatch` y `TURN_PATCH_FIELDS` los declaran; `capturedTurnOf` los proyecta a `CapturedTurn`; `capturedFieldsBefore` los reconoce | RF-31.7, RF-32.4, RF-37.1, RF-37.2 |

Los campos son **opcionales** en el documento, con el comentario «los turnos escritos antes de `specs/004`
no lo tienen» que ya usan `yakuHanOverride` (`:215`) y `audit` (`:231`). **No hay documento nuevo, ni
índice nuevo, ni cambio de escritura** más allá de los campos.

### 3.3 `composables/` — una frontera nueva

| Módulo | Qué cambia | RF |
| ------ | ---------- | -- |
| `useGameTurns.ts` | `deleteTurn` **ya existe** (`:178`) y no se toca; la fase 2 lo expone a la pantalla | RF-33.2 |

Todo lo demás (`nextHand`, `scores`) ya está disponible y no cambia.

### 3.4 `components/` y `pages/`

| Pieza | Qué cambia | RF |
| ----- | ---------- | -- |
| `turns/TurnForm.vue` | Contexto abierta/cerrada y kan por ganador; desglose por cada ganador en ron múltiple; el buscador de yaku con doble nombre | RF-31, RF-32, RF-34 |
| `pages/GameDetailPage.vue` | El botón de borrar el último turno con confirmación; el borrado desde el historial | RF-33.1, RF-35.6 |
| `ui/BaseButton.vue`, `ui/BaseDialog.vue`, `layout/` | Tokens del tema, botones CTA por color de dominio, cabecera | RF-35.1 a RF-35.3 |
| `charts/` | La paleta del tema en vez de los colores nativos de Chart.js | RF-35.7 |
| `pages/` (las ocho) | El rediseño transversal, **incluidas las que el documento no detalla** | RF-35.9 |
| `i18n/locales/es.ts` | El grupo `yaku.*` con «japonés (inglés)»; los textos del borrado y del rediseño | RF-34.1, RF-33 |
| `styles/main.css` | Los tokens del tema con los **valores** del documento, manteniendo los **nombres** | RF-35.1, RF-35.8 |

**No cambian**: `domain/stats.ts`, `domain/ranking.ts`, `domain/uma.ts`, `domain/seasons.ts`,
`domain/game.ts`, `domain/rules.ts`. El cálculo de puntuación y de agregados es el de 001 y 002.

---

## 4. Modelo de datos

Es la primera tabla **con contenido** desde 002, y es lo que hace que 004 no sea una spec pequeña.

### 4.1 Campos nuevos de `games/{gameId}/turns/{turnNo}`

| Campo | Tipo | Opcional | Para qué | RF |
| ----- | ---- | -------- | -------- | -- |
| `handContext` | `{ isClosedHand, hasKan }` por ganador | **Sí** | El contexto que decide qué yaku cuentan, por ganador | RF-31.7 |
| `winnerHands` | desglose por ganador con `yaku`, `yakuHan`, `yakuHanOverride`, `doraCount`, `fu` | **Sí** | El multi-ron con una mano por ganador | RF-32.1 |

### 4.2 Reglas del modelo

- **Ningún campo existente cambia de forma.** `yaku`, `yakuHan`, `doraCount`, `fu` siguen siendo los del
  turno para el caso de un solo ganador (RF-32.2). `winnerHands` **solo** aparece cuando el ron tiene más
  de un ganador.
- **Los dos campos son opcionales.** Un turno escrito antes de 004 no los tiene y se lee igual
  (RF-32.5, RF-37.2, RF-37.5).
- **`rulesetVersion` no cambia** (RF-37.4): los turnos antiguos no se re-puntúan.
- **Sin documento nuevo, sin índice compuesto nuevo, sin cambio de escritura** más allá de los campos.
- **`firestore.rules` no se toca**: las escrituras del borrado y del desglose usan los caminos que ya
  existen.

---

## 5. Decisiones justificadas con la alternativa descartada

### 5.1 Decisiones de datos y dominio

| # | Decisión | Alternativa descartada | Por qué |
| - | -------- | --------------------- | ------- |
| 1 | El contexto de mano y el desglose por ganador son **campos opcionales** del turno | Obligatorios, con migración de los turnos existentes | Un campo obligatorio obliga a migrar partidas reales y a re-puntuarlas, que es justo lo que RF-37.3 prohíbe. El patrón opcional ya existe en el repositorio (`yakuHanOverride`, `audit`) |
| 2 | El desglose por ganador **solo** en ron múltiple | Un desglose por ganador siempre, incluso con uno | No existe el multi-tsumo y el caso común es un ganador; generalizar esquema **y** formulario para un caso que no ocurre es coste sin valor (RF-32.2) |
| 3 | El ajuste a mano sigue siendo un **delta** de cada ganador | Un total absoluto por ganador | RF-22.9 de 002 define el ajuste como delta para que el total siga siendo derivable de la suma. Convertirlo en absoluto al pasar a por-ganador rompería esa regla en el mismo cambio que la cumple (RF-32.3) |
| 4 | Los **turnos antiguos no se migran** | Re-derivar todos los turnos a la forma nueva | Re-puntuaría partidas ya cerradas y contradiría `rulesetVersion` (RF-37.3, RF-37.4) |
| 5 | El kan se aplica en **los dos sentidos** (`HAS_KAN` y `NO_KAN`) | Un solo sentido, el que suma | `ippatsu` exige ausencia de kan (`domain/yaku.ts:186`). Tratar el kan como solo aditivo dejaría un caso sin cubrir (RF-31.4, `004-qa.md` B6) |

### 5.2 Decisiones de estructura de código

| # | Decisión | Alternativa descartada | Por qué |
| - | -------- | --------------------- | ------- |
| 6 | El borrado **reutiliza `deleteTurn`** y añade la pantalla | Reimplementar el borrado en el componente | `deleteTurn` (`useGameTurns.ts:178`) ya renumera, registra, pide la excepción de bancarrota y reescribe agregados. Reimplementarlo en un `.vue` violaría constitution V.1 y perdería los tests de `useGameTurns.test.ts:716` (RF-33.2) |
| 7 | El borrado solo ofrece el **último** turno | Cualquier turno, con renumeración de los posteriores | La capacidad de renumerar un intermedio existe, pero exponerla en pantalla complica la captura sin que el club lo haya pedido. Se declara fuera de alcance (§7 de la spec) |
| 8 | `TurnForm.vue` se toca **entero en una fase** (fase 1) | Una fase por requisito de RF-31/RF-32 | Los requisitos comparten el mismo `computed` de la mano y el mismo fichero. Varias fases producen varios commits que rompen el mismo archivo, y el `git diff` de la revisión se vuelve ilegible (misma razón que 003, decisión 6) |
| 9 | El nombre en inglés vive en **`i18n`, grupo `yaku.*`** | Un campo `englishName` en `domain/yaku.ts` | El nombre es traducción, no regla: no cambia han, ni categoría, ni condiciones. El catálogo de `domain/` es puro y ajeno al idioma (RF-34.2) |
| 10 | Los tokens del tema **migran valores conservando nombres** | Renombrar los tokens a los del documento (`bg-main`, `mahjong-red`…) | Conservar nombres deja el `git diff` de los componentes casi vacío y el riesgo de migración es mecánico; renombrar tocaría los 59 usos en 9 ficheros sin ganar nada (RF-35.1, `004-qa.md` B10) |
| 11 | La puerta de 004 es **cobertura de `domain/` + diff declarado + suite verde** | Reutilizar la de 003 (`domain/` congelado) | No puede ser: 004 **sí** escribe en el dominio, así que la puerta de 003 sería un criterio imposible (`004-qa.md` A3) |
| 12 | Las pruebas del rediseño puramente estético se declaran **revisión visual** | Automatizar cada clase de color | Es la fórmula que 003 usó para RF-26 (`trazabilidad.test.ts` `VISUAL_REVIEW`): el guardián admite ese camino, pero obliga a escribirlo con motivo (RF-36.1) |

---

## 6. Estrategia de tests

### 6.1 Niveles y umbrales

| Nivel | Qué cubre | Umbral |
| ----- | --------- | ------ |
| `src/__tests__/yaku.test.ts` | El contexto de mano por ganador en el motor | **Bloqueante**: entra en el 100 % de `domain/` |
| `src/__tests__/handValue.test.ts` | El desglose por ganador en el cálculo | **Bloqueante**: 100 % de `domain/` |
| `src/__tests__/replay.test.ts` | El contexto y el desglose sobreviven a la re-derivación | **Bloqueante**: 100 % de `domain/` |
| `src/__tests__/turns.repository.test.ts` | Compatibilidad de turnos antiguos, campos opcionales, auditoría del desglose | Sin umbral, se reporta |
| `src/__tests__/TurnForm.test.ts` | RF-31, RF-32, RF-34 en la captura | Sin umbral, se reporta |
| `src/__tests__/GameDetailPage.test.ts` | RF-33 (borrado) | Sin umbral, se reporta |
| `src/__tests__/locales.test.ts` | Los 46 nombres con inglés | Sin umbral, se reporta |
| `src/__tests__/charts.test.ts`, `StatsPage.test.ts` | La paleta del tema en las gráficas | Sin umbral, se reporta |
| `src/__tests__/trazabilidad.test.ts` | Que cada RF de `specs/004` tenga test o revisión visual declarada | Sin umbral, se reporta |

**El único umbral bloqueante de 004 es el 100 % de `src/domain/`** (constitution IV.1), porque 004 sí
escribe ahí. La suite entera —848+ tests— tiene que seguir verde por RF-36.2.

### 6.2 Los barridos que más valor dan

Son tests de invariante, no de ejemplo:

| `describe` | Qué barre | Por qué |
| --------- | --------- | ------- |
| `yaku.test.ts` → `'contexto por ganador'` | `isClosedHand` × `hasKan` sobre un yaku sin condición, uno con `CLOSED_HAND`, uno con `HAS_KAN` y uno con `NO_KAN` | El cuarto es `ippatsu`: es el caso que hoy no existe (kan **quita** un yaku) |
| `handValue.test.ts` → `'multi-ron'` | Dos ganadores con manos distintas × el reparto del motor | Comprueba que el cálculo por ganador del motor coincide con el desglose que ahora puede capturar la interfaz |
| `turns.repository.test.ts` → `'turno anterior a 004'` | Un turno sin los campos nuevos, leído y re-derivado | Es RF-37.5: la compatibilidad no es «por construcción», es un test |
| `TurnForm.test.ts` → `'la mano por ganador'` | Un ron con dos ganadores, cada uno con su contexto | Es RF-32 entero, y es el caso donde el formulario aplanador de hoy falla |
| `GameDetailPage.test.ts` → `'borrar el último turno'` | Último turno · turno intermedio · partida marcada · recuento desfasado | Los dos últimos son los que rompen: la marca y `staleLocal` |
| `locales.test.ts` → `'yaku con inglés'` | Los 46 ids del catálogo | Añadir un yaku sin inglés tiene que doler |

### 6.3 El patrón que se reutiliza

- **El guardián de trazabilidad.** `trazabilidad.test.ts:20` lee hoy `specs/003/spec.md`. Se
  **parametriza** a `specs/004/spec.md`, con el mismo mecanismo (`VISUAL_REVIEW` para lo puramente
  estético). Es la extensión que pide §9.9 de la spec.
- **Los tests que leen el disco.** `locales.test.ts` y `handValue.test.ts:302` son el modelo para el test
  de los 46 nombres.
- **La puerta de la suite.** Ningún `data-test`, `role` ni etiqueta desaparece: es RF-36.1 y lo comprueba
  la propia suite existente, que no se edita para que pase.

### 6.4 Verificación por tarea

Al terminar cada tarea, los cuatro en verde y en este orden (constitution III.1):

```
npm run typecheck && npm run lint && npm run test && npm run format:check
```

Y al terminar **cada fase**, `git diff --name-only src/domain` tiene que mostrar **solo** lo que §0 de la
spec declara. Un cambio en el dominio que la spec no autorice **para la fase**.

---

## 7. Trazabilidad RF → módulo → test

| RF | Módulo | Test |
| -- | ------ | ---- |
| RF-31.1 a RF-31.5 | `TurnForm.vue` + `domain/yaku.ts` | `TurnForm.test.ts` → `'la mano por ganador'` + `yaku.test.ts` |
| RF-31.6, RF-31.7 | `domain/{handValue,turn,replay}.ts` | `replay.test.ts` → `'contexto por ganador'` |
| RF-32.1, RF-32.3 | `TurnForm.vue` + `domain/handValue.ts` | `TurnForm.test.ts` → `'la mano por ganador'` |
| RF-32.2 | `TurnForm.vue` | `TurnForm.test.ts` → `'un solo ganador'` |
| RF-32.4 | `turns.repository.ts` | `turns.repository.test.ts` → `'auditoría del desglose'` |
| RF-32.5 | `turns.repository.ts` | `turns.repository.test.ts` → `'turno anterior a 004'` |
| RF-33.1 a RF-33.3 | `GameDetailPage.vue` | `GameDetailPage.test.ts` → `'borrar el último turno'` |
| RF-33.4 | `useGameTurns.ts` (ya existe) | `useGameTurns.test.ts` → `'T30 · deleteTurn'` |
| RF-33.5, RF-33.6 | `GameDetailPage.vue` | `GameDetailPage.test.ts` → `'borrar el último turno'` |
| RF-33.7 | `useGameTurns.ts` | `useGameTurns.test.ts` → agregados tras borrado |
| RF-34.1, RF-34.2 | `es.ts` + `TurnForm.vue` | `TurnForm.test.ts` + `locales.test.ts` |
| RF-34.3 | `es.ts` | `locales.test.ts` → `'yaku con inglés'` |
| RF-34.4 | `TurnForm.vue` | `TurnForm.test.ts` → `'buscador de yaku'` |
| RF-35.1, RF-35.2 | `styles/main.css` | Medición: `git grep` de colores fuera de tokens |
| RF-35.3 a RF-35.9 | `pages/`, `components/` | Los tests de componente existentes, verdes + los nuevos de aspecto |
| RF-35.10 | `styles/main.css` | Medición: no hay tema claro |
| RF-35.11 | `charts/`, `pages/` | `charts.test.ts` (la paleta sale del tema, no del componente) |
| RF-36.1 a RF-36.3 | todo | La suite entera verde, sin editar sus aserciones |
| RF-36.4 | `package.json` + enmienda | `AGENT.md` → Rules actualizado |
| RF-37.1 a RF-37.5 | `domain/` + `data/` | `replay.test.ts`, `turns.repository.test.ts` |

---

## 8. Checklist de salida

| # | Condición | Origen |
| - | --------- | ------ |
| 1 | Los cuatro comandos en verde, en orden | Constitution III.1 |
| 2 | **`src/domain/` con los cambios declarados**, y ninguno fuera | `plan.md` §1.1 |
| 3 | La cobertura de `src/domain/` sigue en el **100 %** | Constitution IV.1 |
| 4 | Un turno anterior a 004 se re-deriva igual que antes | RF-37.5 |
| 5 | Un ron con dos ganadores guarda dos desgloses | RF-32.1 |
| 6 | Marcar kan **quita** un yaku que exige su ausencia (`ippatsu`) | RF-31.4 |
| 7 | El detalle ofrece borrar el **último** turno, con confirmación, y no otro | RF-33.1, RF-33.3 |
| 8 | Borrar el último turno de una partida marcada levanta la marca | RF-33.4 |
| 9 | Ninguno de los 848 tests existentes se editó para que pase | RF-36.2 |
| 10 | Los 46 yaku tienen nombre en inglés | RF-34.3 |
| 11 | No hay ningún `tailwind.config.*` en el repositorio | RF-35.1 |
| 12 | Los tokens conservan el nombre y cambian de valor | RF-35.1 |
| 13 | El rediseño alcanza las ocho pantallas, no solo cuatro | RF-35.9 |
| 14 | La dependencia de búsqueda tiene su enmienda escrita, o está declarada bloqueada | RF-36.4, `plan.md` §2.1 |
| 15 | El guardián de trazabilidad cubre `specs/004` | `spec.md` §9.9 |

---

## 9. Riesgos y cómo se mitigan

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| El modelo per-ganador rompe un turno existente | Partidas reales cambian de puntuación | RF-32.5 y RF-37.3: solo turnos nuevos; el barrido `'turno anterior a 004'` lo fija |
| Una fase toca `domain/` «de paso» | La puerta de cobertura se rompe sin que nadie lo note | La condición 2 de §8 comprueba el diff **al terminar cada fase**, y la cobertura muerde (es un umbral, no un efecto colateral) |
| El rediseño borra un `data-test` y algo deja de comprobarse | Un comportamiento se queda sin red sin que falle nada | RF-36.1 y la condición 9: la suite **no se edita**; si un test falla por un `data-test` perdido, se recupera el atributo |
| La dependencia de búsqueda no encaja con el stack | El rediseño del selector se bloquea | §2.1: se comprueban los `peerDependencies` antes de fijarla; si no encaja, se declara bloqueada y no se sustituye por una sin verificar |
| El desglose por ganador duplica el cálculo del motor | Dos fuentes de la misma suma | RF-32: la captura guarda **lo capturado**; el motor sigue calculando. El barrido `'multi-ron'` comprueba que coinciden |
| Los agregados históricos cambian al borrar | Estadísticas de temporada inconsistentes | RF-33.7: el turno borrado no cuenta; `deleteTurn` ya reescribe los agregados |
| La migración de tokens deja una clase apuntando a un color muerto | Una pantalla se ve sin color, y ningún test lo pilla | Es el checklist 11 y 12; la búsqueda de colores fuera de tokens lo cubre |

---

## 10. Lo que este plan obliga a cambiar en `../../AGENT.md` y en la constitución

| Fichero | Cambio | Por qué |
| ------- | ------ | ------- |
| `docs/constitution.md` → Enmiendas | Añadir la enmienda de **dependencias** por la librería de búsqueda con etiquetas de RF-35.5, con su motivo y sus `peerDependencies` comprobados | Lo exige II.2: subir o añadir dependencia es un cambio de spec con motivo escrito |
| `AGENT.md` → Stack | Fijar la versión de la librería de búsqueda y de las fuentes autoalojadas | II.1: las versiones del stack se fijan tras comprobar los `peerDependencies` |
| `AGENT.md` → Data model | Añadir los campos opcionales del contexto de mano y del desglose por ganador a la tabla de `turns/{turnNo}` | 004 **sí** cambia el modelo; la tabla tiene que decirlo |
| `AGENT.md` → Tests | Añadir que la puerta de una spec que **sí toca `domain/`** vuelve a ser la cobertura de IV.1 más el diff declarado | Es la lección simétrica a la que dejó 003: una puerta que no muerde es peor que ninguna, en las dos direcciones |
| `AGENT.md` → Tailwind | Añadir que la paleta vive en `@theme` y que los tokens cambian de **valor**, no de **nombre** | Es la decisión 10, y sin escribirlo la siguiente spec de estilo renombra los tokens |
| `AGENT.md` → Reglas de seguridad | Ninguno | `firestore.rules` no se toca |

---

## 11. Lo que este plan no cubre

- **La captura de la mano ganadora.** El indicador de dora, el ura dora y las fichas siguen sin
  capturarse; RF-22.7 sigue confiando en lo que pone quien captura.
- **005 · Reglaset M.League.** `ruleset: 'mleague'` sigue sin admitir captura.
- **El final de una ronda.** RF-18.21 de 002 lo declara no modelado.
- **La captura sin conexión por test.** `docs/reviews/002-red.md` lo declaró inalcanzable y nada ha
  cambiado.
- **Borrar un turno intermedio.** La capacidad existe, no se expone (decisión 7).
- **La migración de turnos antiguos.** Los turnos anteriores a 004 no se re-puntúan (RF-37.3).
- **La corrección del hueco de 0 han con riichi.** Sigue siendo decisión de reglas del club.
- **Rehacer el formulario por completo.** 004 añade el desglose por ganador y el contexto; no reordena
  todos los campos.
