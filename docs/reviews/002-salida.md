# 002-salida.md — Checklist de salida de `specs/002` (T47)

Comprobación una a una de las **doce** condiciones de `specs/002/plan.md` §8. Cada fila dice con qué
se midió, no solo si se cumple. Es el cierre de la fase 8 y el acta de lo que `specs/002` dejó abierto.

**Fecha:** 2026-10-15 · **Alcance:** `specs/002`, fases 0 a 8.

**Resumen:** 11 condiciones cumplidas, **1 con una salvedad que no se puede cerrar desde aquí** (la 11,
por el historial de commits) y **1 defecto encontrado y corregido durante esta comprobación** (la 10).

| # | Condición | Veredicto |
| - | --------- | --------- |
| 1 | Los cuatro comandos en verde, en orden | **Cumplida** |
| 2 | 100 % de líneas, ramas y funciones en `src/domain/` | **Cumplida** |
| 3 | Toda función pura de `domain/` con su test nombrado como el módulo | **Cumplida** |
| 4 | `any` inexistente; `strict` y `noUncheckedIndexedAccess` sin relajar | **Cumplida** |
| 5 | El narrowing se hace desde `state.status` | **Cumplida** |
| 6 | Ningún import de `firebase/*` fuera de `data/` y `app/firebase.ts` | **Cumplida** |
| 7 | Exactamente dos stores, ninguno consumiendo `useQuery()` | **Cumplida** |
| 8 | `lint` ejecutado en modo check, sin mutar ficheros | **Cumplida** |
| 9 | Los tres RF derogados escritos en `specs/001/spec.md` | **Cumplida** |
| 10 | Ningún campo nuevo sin fila en la tabla de derogaciones de `spec.md` §4 | **Cumplida tras corregir** |
| 11 | La fase 0 cerrada antes de empezar la fase 1 | **No demostrable con el historial** |
| 12 | El experimento de red hecho y su resultado escrito | **Cumplida** |

---

## 1 · Los cuatro comandos en verde, en orden · Constitution III.1

Ejecutados uno a uno, con su `exit`-code, en el orden que fija la constitución:

```
npm run typecheck    → exit 0, sin salida
npm run lint         → exit 0, 0 errores y 2 warnings
npm run test         → exit 0, 59 ficheros · 803 pasados | 4 saltados
npm run format:check → exit 0, «All matched files use Prettier code style!»
```

Los dos warnings son `vue/one-component-per-file` en `src/__tests__/BaseTable.test.ts` (líneas 35 y 83),
**preexistentes a `specs/002`** y ajenos a su alcance. No se corrigen aquí: constitution III.1 manda
declararlos, no esconderlos.

Los 4 tests saltados son el bloque `describe.skipIf(!EMULATOR)` de `firestore.rules.test.ts`, que
necesita `FIRESTORE_EMULATOR_HOST`. Se salta **dicho**, no por omisión: el propio bloque lo explica.

## 2 · 100 % en `src/domain/` · Constitution IV.1

```
Statements   : 100% ( 493/493 )
Branches     : 100% ( 317/317 )
Functions    : 100% ( 124/124 )
Lines        : 100% ( 473/473 )
12 files fully covered. No files with missing coverage.
```

El umbral está configurado en `vitest.config.ts` con `thresholds` a 100 en las cuatro métricas, así que
`test:coverage` **falla** si baja. No es un informe que alguien lee: es una puerta.

## 3 · Una función pura de `domain/`, un test nombrado como el módulo · Constitution IV.2

Los 12 módulos de `src/domain/` contra los 12 tests de `src/__tests__/`:

| Módulo | Test | Módulo | Test |
| ------ | ---- | ------ | ---- |
| `game.ts` | `game.test.ts` | `stats.ts` | `stats.test.ts` |
| `handValue.ts` | `handValue.test.ts` | `stats/recalculate.ts` | `recalculate.test.ts` |
| `ranking.ts` | `ranking.test.ts` | `turn.ts` | `turn.test.ts` |
| `replay.ts` | `replay.test.ts` | `types.ts` | `types.test.ts` + `types.test-d.ts` |
| `rules.ts` | `rules.test.ts` | `uma.ts` | `uma.test.ts` |
| `seasons.ts` | `seasons.test.ts` | `yaku.ts` | `yaku.test.ts` |

Correspondencia 1:1, sin huecos ni duplicados. Y la condición 2 la respalda desde el otro lado: si un
módulo tuviera una función sin probar, la cobertura de funciones no llegaría al 100 %.

## 4 · `any` inexistente; `strict` y `noUncheckedIndexedAccess` sin relajar · VI.1

- `tsconfig.app.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`.
- Búsqueda de `: any`, `as any`, `<any>` y `any[]` en **todo** `src/` (`.ts` y `.vue`): **cero**.

## 5 · El narrowing se hace desde `state.status` · VI.2

Solo hay dos accesos a `.value.status` en el código de producción, y **ninguno** estrecha un estado de
`@pinia/colada`:

- `GameForm.vue:197` — `candidateSeason` es un `computed` que devuelve un `SeasonRecord | null`
  construido a mano. Estrechar `status === 'closed'` es estrechar un registro del dominio.
- `GameDetailPage.vue:164` — `game.value.status === 'open'` lee el campo `status` **del documento de
  partida** (`'open' | 'finalized' | …`), no el de una query. El estrechado de verdad ocurre en
  `GameDetailPage.vue:33-35`, y es exactamente `state === undefined || state.status !== 'success'`.

Los siete accesos a `.isLoading.value` están en plantillas, para deshabilitar botones: leer un booleano
no estrecha nada.

## 6 · Ningún import de `firebase/*` fuera de `data/` y `app/firebase.ts` · V.1

En **código de producción** los 19 imports de `firebase/*` están en `src/app/firebase.ts` (6) y en
`src/data/` (13). Ni un `.vue` los importa.

Lo que sí aparece fuera son **doce imports en cinco ficheros de `src/__tests__/`**: cuatro
repositorios que inspeccionan el doble de Firestore, `batch.test.ts` y `firestore.rules.test.ts`, que
contra el emulador necesitan el SDK real. Eso es lo correcto: V.1 separa **capas de producción**, y un
test que habla con el emulador tiene que hablar con el SDK. `src/test-utils/` no importa nada de
Firebase: su doble es autónomo a propósito.

## 7 · Exactamente dos stores, ninguno consumiendo `useQuery()` · V.2

`src/stores/` contiene `preferences.ts` y `session.ts`. La búsqueda de `useQuery(` en los stores
devuelve **una** coincidencia, y es la línea 23 de `preferences.ts`, que es un comentario que dice
justo que no lo usa. `useMutation(` tampoco aparece.

## 8 · `lint` en modo check, sin mutar ficheros · III.1

`package.json` distingue `"lint": "eslint ."` de `"lint:fix": "eslint . --fix"`. Además se ha medido:
se calculó la firma de los **142** ficheros de `src/` antes y después de `npm run lint`, y es
**idéntica**. No muta nada.

## 9 · Los tres RF derogados escritos en `specs/001/spec.md`

`specs/001/spec.md` §8.1 *Derogaciones posteriores* tiene sus tres filas: **RF-3.13**, **RF-4.3** y
**RF-6.5**, cada una con qué exigía, qué lo sustituye y por qué. Es lo que exige constitution I.1 para
que 002 toque la spec cerrada.

## 10 · Ningún campo nuevo sin fila en la tabla de `spec.md` §4

**Esta condición fallaba al empezar esta comprobación.** `discarderId` y `chomboId` son campos nuevos
de `turns/{turnNo}`, están en la tabla de `AGENT.md` y en un párrafo que explica que son captura y no
cálculo —y sin ellos un ron o un chombo guardado no se puede volver a resolver—, pero **no tenían fila
en la tabla de cambios de modelo de `spec.md` §4**, ni aparecían en `plan.md`.

Es exactamente el fallo que el hallazgo C2 describe: un campo nuevo que llega al modelo sin declararse.
Lo que pasa es que los dos se añadieron en la fase 2 y se documentaron en `AGENT.md`, que es donde el
plan §4 dice que se documentan, pero no se declararon en la spec.

**Corregido**: la tabla de §4 pasa de cinco a seis filas y declara los dos campos, con su RF. La condición
se cumple ahora.

## 11 · La fase 0 cerrada antes de empezar la fase 1 · Constitution I.1

**No se puede demostrar con el historial, y el historial apunta en contra.** No la doy por cumplida.

El repositorio tiene dos commits:

| Commit | Fecha | `src/domain/` | `specs/001/spec.md` §8.1 |
| ------ | ----- | ------------- | -------------------------- |
| `e44c72d` *init and fase 1 -7* | 2026-10-06 | 8 módulos, **sin `replay.ts`** | **no existe** |
| `467d13d` *Spec 02 - fase 0 -2* | 2026-10-15 | 12 módulos, con `replay.ts` | **existe** |

Lo que dice esa tabla: la fase 1 entró en el primer commit y las fases 2 a 7, junto con la fase 0, en
el segundo. Es decir, **el código de la fase 1 está en un commit anterior a las derogaciones que la
fase 0 tenía que escribir**, que es justo lo que constitution I.1 prohíbe.

El nombre del primer commit, «fase 1 -7», no se corresponde con su contenido: no contiene `replay.ts`,
que es la fase 2. Y buena parte del trabajo de las fases 5 a 8 sigue **sin commitear**, así que el
historial ni siquiera cubre todo lo que se hizo.

Lo que sí dice la evidencia de proceso, que no es la misma cosa:

- T01, T02 y T03 están marcadas y su «Hecho cuando» registra que **la fase 0 no toca `src/`**: «la
  suite salió idéntica antes y después, 528 pasados en ambos casos».
- T01 deja por escrito que hubo que **pedir permiso explícito** para tocar `specs/001/spec.md`.

O sea: quien ejecutó la fase 0 dejó constancia de haberla hecho como unidad separada y de haber
pedido autorización. Lo que **no** hay es un commit que lo demuestre, porque el squash de las fases 2 a
8 borró la frontera.

**No se puede corregir desde aquí.** Arreglarlo exigiría reescribir el historial, y un checklist de
salida no es el sitio para reescribir historia. Lo que procede es dejarlo escrito —que es lo que hace
esta fila— y que el club decida si acepta el riesgo o rehace los commits.

Consecuencia práctica: **ninguna de las otras once condiciones depende de esta**, porque todas se
miden sobre el árbol de trabajo actual, que es el que se entrega. Lo que la 11 protege es la trazabilidad
del *proceso*, no el resultado.

## 12 · El experimento de red hecho y su resultado escrito · Criterio 26 de la spec

`docs/reviews/002-red.md`, con las cuatro mediciones, los tres motivos y lo que **no** dice. El
resultado es negativo y por eso el criterio 26 queda **declarado fuera de alcance por escrito**, que es
lo que el propio criterio prevé para este caso.

---

## Lo que `specs/002` deja escrito y no resuelto

- **El criterio 26** (RNF-5 de 001 por comportamiento) se ha retirado con motivo. Lo que sí sostiene
  RNF-5 —la re-derivación es pura y la escritura es atómica— está comprobado por otra vía.
- **T43** queda descartada, no cumplida.
- **`isRenchan` e `isFinalTurn`** son campos muertos y `isFinalTurn` se calcula mal, según el
  `plan.md` §10. Ningún RF los pide y fabricar una definición de «turno final» para una partida que se
  prolonga sería inventar una regla, así que no se tocan.
- **La inalterabilidad del registro la garantiza el cliente**, no `firestore.rules`, y está escrito con
  su consecuencia asumida en `AGENT.md` → Reglas de seguridad.
- **La condición 11** queda sin poder cerrarse, con la explicación de arriba.