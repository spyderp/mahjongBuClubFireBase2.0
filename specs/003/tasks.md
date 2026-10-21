# tasks.md — Tareas de `specs/003`

Listado de trabajo derivado de [`spec.md`](spec.md) y [`plan.md`](plan.md). El plan dice **qué** se
construye y en qué orden; este documento lo parte en tareas de 20 a 30 minutos.

## Cómo se usa

- Cada tarea es un `- [ ]`. **Marca la casilla solo cuando el «Hecho cuando» de esa tarea se cumple.**
- Para saber qué falta:

  ```bash
  grep -c '^- \[ \]' specs/003/tasks.md
  grep -n '^- \[ \]' specs/003/tasks.md
  ```

- Las tareas van en **orden de dependencias**: nada empieza antes de que su bloque termine.
- **Constitution III.1 se verifica al terminar cada tarea**, no al final:

  ```bash
  npm run typecheck && npm run lint && npm run test && npm run format:check
  ```

  `lint` es solo check. Un fallo ajeno al cambio se declara en la respuesta; no se oculta ni se salta un
  paso.

- **La puerta propia de 003 se verifica al terminar cada fase**, y no es la cobertura:

  ```bash
  git diff --name-only src/domain
  ```

  Tiene que salir **vacío**. Es la condición que hace que 003 sea una especificación pequeña
  (`plan.md` §1.1).

- **Constitution IV.1 sigue aplicando**: el 100 % de `src/domain/` se mantiene, pero como **efecto
  colateral**, no como criterio de 003.

**Estimación:** 25 tareas · 12 a 17 horas. Una queda **bloqueada por el club** —T21— y no computa en el
total porque depende de un fichero que aún no existe.

---

## Fase 0 · Cerrar los huecos que dejó 002 — 5 tareas

Lo primero porque son baratos y porque **RF-30.1 es lo único de 003 que escribe fuera de la interfaz**.
Cerrar las deudas antes de añadir superficie es más barato que encontrarlas después.

- [x] **T01** `gameLength` no cambia el recorrido · **Cubre:** RF-30.4 · **Hecho cuando:** un `describe` nuevo en `determinismo.test.ts` recorre **la misma secuencia de turnos de más de cuatro manos** en `tonpuusen` y en `hanchan`, y ambos dan turnos, marcadores y `nextHand` idénticos.
- [x] **T02** El registro no tiene campo de motivo · **Cubre:** RF-30.5 · **Hecho cuando:** un test afirma que `TURN_PATCH_FIELDS` no incluye ningún campo de motivo y que `TurnCorrectEntry` y `TurnDeleteEntry` no lo declaran.
- [x] **T03** El nombre del test del chombo dice lo que hace · **Cubre:** RF-30.6 · **Hecho cuando:** `TurnForm.test.ts` ya no se llama _«un chombo no es renchan: el dealer pierde la mano y la localía avanza»_, sino uno que dice que el chombo **conserva** la localía, y su aserción sigue siendo `isRenchan === false`.
- [x] **T04** `capturedFieldsBefore` · **Cubre:** RF-30.1, RF-30.2 · **Hecho cuando:** la función pura existe en `turns.repository.ts`, devuelve `{ [campo]: valor anterior }` **solo de los campos capturados** de la entrada más reciente, y un `describe` nuevo fija los tres casos: una corrección de un campo capturado, una de dos campos, y una que solo tocó derivados —que devuelve vacío—.
- [x] **T05** Reconstruir con los derivados recalculados · **Cubre:** RF-30.3 · **Hecho cuando:** un test restaura un turno corregido con T04 y comprueba que los **derivados no salen del registro**: vienen de volver a derivar la partida, y un turno anterior que haya cambiado después no invalida la reconstrucción.

**Decisión de fase.** T04 y T05 escriben en `data/`, no en `domain/`. Es la excepción que
`plan.md` §3.2 justifica: `capturedTurnOf` y `toTurnSnapshot` ya viven ahí por el mismo motivo, y es una
proyección de un documento, no un cálculo.

> **T04 · endurecida (2026-10-21).** La lista de derivados de `capturedFieldsBefore` se alineó con la
> del sistema —`useGameTurns` → `DERIVED_FIELDS`— y acabó incluyendo el **bote de riichi**. RF-30.2
> enumera cinco derivados y no lo menciona, pero RF-18.8 sí lo cuenta entre los que «el sistema vuelve a
> calcular», y `useGameTurns` lo marca como `derived` en cada corrección. Sin eso, `capturedFieldsBefore`
> devolvía un valor **calculado** como si lo hubiera escrito una persona, que es justo lo que RF-30.2
> veta en el mismo cambio que lo cumple (`plan.md` §5.1, decisión 1). El caso no es raro: cualquier turno
> con riichi declarado lleva el bote consigo. La corrección no toca `domain/` y no cambia la firma.

---

## Puerta de dominio 0

```bash
git diff --name-only src/domain   # tiene que salir vacío
```

**La fase 8 tiene su equivalente al final**, y esta puerta se repite al terminar cada fase.

---

## Fase 1 · La mesa en la pantalla de captura — 5 tareas

El 70 % del valor de 003, **entero en una fase**. Los cuatro requisitos tocan el mismo `computed` de la
mesa y el mismo fichero: separarlos produciría cuatro commits que rompen el mismo archivo
(`plan.md` §5.2, decisión 6).

- [x] **T06** La mesa tiene los cuatro datos · **Cubre:** RF-24.1 a RF-24.4 · **Hecho cuando:** el `describe` nuevo `'la mesa'` recorre sin turnos, con un turno y tras corregir, y en cada caso muestra nombre con asiento, delta con color, marca de localía y viento por asiento.
- [x] **T07** Los nombres, no los asientos · **Cubre:** RF-24.1 · **Hecho cuando:** los **cinco** desplegables de jugador —ganador, descartador, tenpai, riichi y chombo— ofrecen el nombre con su asiento al lado, y el test comprueba los cinco, no solo el primero.
- [x] **T08** El color del delta es el del token · **Cubre:** RF-24.2 · **Hecho cuando:** el `describe` `'color del delta'` barre **delta positivo, cero y negativo**, y el cero se muestra **sin color**. Las clases aplicadas son `--color-mahjong-positive` y `--color-mahjong-negative`, y ninguna otra.
- [x] **T09** La marca de localía sigue a la localía real · **Cubre:** RF-24.3 · **Hecho cuando:** el `describe` `'marcador de localía'` fija los cuatro asientos, y **el caso del Sur** comprueba que la marca **no** acompaña al Este. Con la localía en Este, un test de este tipo pasaría igual, así que ese caso es el que discrimina.
- [x] **T10** El viento por asiento · **Cubre:** RF-24.4 · **Hecho cuando:** junto al nombre de cada jugador aparece el viento de la mano en curso, y el test comprueba que **cambia** al cruzar la vuelta del Este al Sur.

---

## Fase 2 · Capturar sin buscar — 2 tareas

- [x] **T11** El buscador de yaku · **Cubre:** RF-25.1 · **Hecho cuando:** escribir texto deja solo las entradas que lo contienen, un filtro sin coincidencia deja la lista vacía **sin perder las casillas ya marcadas**, y limpiar el filtro las devuelve todas.
- [x] **T12** El riichi en horizontal · **Cubre:** RF-25.2 · **Hecho cuando:** las casillas de declaración de riichi se renderizan en una fila y el test comprueba **que siguen marcando y desmarcando igual** que antes del cambio de orientación.

---

## Fase 3 · Lectura del resultado — 1 tarea

- [x] **T13** La diferencia de puntos al hacer clic · **Cubre:** RF-26.1, RF-26.2 · **Hecho cuando:** al hacer clic en un jugador del detalle aparece, junto a cada uno de los otros tres asientos, la diferencia de ese jugador contra el rival de ese asiento (su marcador menos el del rival), y **con marcadores iguales la diferencia es cero, no una celda vacía**.

> **T13 · cerrada por revisión visual (2026-10-20).** El club comprobó a mano que la diferencia aparece
> al pulsar un jugador y que el cero se pinta como `0`, no como celda vacía. **No se automatiza por
> decisión del club**, así que RF-26.1 y RF-26.2 quedan declarados en `VISUAL_REVIEW` de
> `src/__tests__/trazabilidad.test.ts` con ese motivo, en lugar de fingir que hay un test. El guardián
> `trazabilidad.test.ts` es consecuencia directa de este hueco: un RF sin test deja de ser verde.

---

## Fase 4 · Jugadores activos — 3 tareas

La última de la interfaz porque es la única que toca una **decisión vigente de 001** —RF-2.9—.

- [x] **T14** Los activos primero · **Cubre:** RF-27.1 · **Hecho cuando:** el desplegable ofrece primero a los dados de alta y después a los que no lo están, marcados con el motivo.
- [x] **T15** Repetir jugador entre partidas abiertas sigue permitido · **Cubre:** RF-27.2 · **Hecho cuando:** un jugador que ya participa en otra partida abierta **se ofrece igual**, con aviso, porque RF-2.9 de 001 lo permite.
- [x] **T16** Un club sin jugadores activos puede jugar · **Cubre:** RF-27.3 · **Hecho cuando:** con **ningún** jugador dado de alta el desplegable los ofrece igualmente y la partida se puede completar, y un mismo jugador no aparece en dos asientos.

---

## Fase 5 · Ayuda y referencia — 4 tareas

La única fase que **crea componente** y la única bloqueada por un fichero del club.

- [x] **T17** El documento markdown de la ayuda · **Cubre:** RF-28.2 · **Hecho cuando:** existe `src/docs/ayuda-turnos.md`, se importa con `?raw`, y `npm run build` lo incluye. **Typecheck no lo detecta**: solo el build lo comprueba.
- [x] **T18** `HelpModal.vue` · **Cubre:** RF-28.1 · **Hecho cuando:** el modal se abre desde la pantalla de captura, pinta el contenido del markdown, y cierra con Escape y con el botón —`BaseDialog` ya lo hace, y **no se toca**.
- [x] **T19** El texto no puede driftar · **Cubre:** RF-28.3 · **Hecho cuando:** un test **lee `src/docs/ayuda-turnos.md` desde el disco** y comprueba que es el mismo texto que la interfaz pinta, con el patrón de `handValue.test.ts:302`. Editar el fichero sin actualizar la pantalla **falla**.
- [x] **T20** Abrir y cerrar no pierde nada · **Cubre:** RF-28.5 · **Hecho cuando:** abrir y cerrar cualquiera de los dos modales deja el formulario y el borrador de `localStorage` **exactamente** como estaban, y con la captura a medio rellenar.

### Bloqueado por el club · RF-28.4

- [x] **T21** El modal de la tabla de puntuación · **Cubre:** RF-28.4 · **Hecho cuando:** existe `src/assets/tabla-puntuacion.png`, la aporta el club, y un test falla si el fichero no está.

> **T21 no se puede hacer todavía.** El plan **no** pone una tabla sustituta: una tabla de puntuación
> inventada en el hueco de la del club daría **números falsos con buena pinta**, que es peor que un build
> roto. T17 a T20 sí se hacen y **tampoco dependen del club**. Cuando llegue la imagen, T21 es escribir el
> test.

> La imagen es una **instantánea**: su contenido **no** puede comprobarse contra `docs/domain.md` §4.2. Lo
> que sí se garantiza es que exista, que esté referenciada y que borrarla rompa el build. Está declarado
> en `spec.md` RF-28.4 y en el criterio 25, para que nadie lo dé por comprobado sin serlo.

---

## Fase 6 · Abortar deja inconclusa — 2 tareas

Al final a propósito: toca **dos cadenas y ningún cálculo**, y se puede revertir en un segundo
(`plan.md` §2).

- [x] **T22** El botón dice «abortar» · **Cubre:** RF-29.1 · **Hecho cuando:** el botón dice **«abortar»** y en ninguna pantalla queda la cadena «abandonar» aplicada a esta acción.
- [x] **T23** El aviso dice «inconclusa» y `aborted` solo es de finalizar · **Cubre:** RF-29.2, RF-29.3 · **Hecho cuando:** el aviso dice que la partida queda **inconclusa** y **no** dice que queda abortada, y un test recorre `es.ts` buscando que la palabra «abortada» no aparezca ligada al estado `unfinished`. La transición sigue devolviendo `unfinished` (`domain/game.ts:107`), que es `unfinished: 'Inconclusa'` en `es.ts:251`.

---

## Fase 7 · Checklist de salida — 2 tareas

La fase 8 de 002 hacía esto y encontró tres cosas. Esta repite el método.

- [x] **T24** Los doce puntos del checklist de salida · **Cubre:** todos · **Hecho cuando:** las 12 condiciones de `plan.md` §8 están comprobadas una a una, incluida la 2 —`src/domain/` sin cambios— y la 5 —la imagen de la tabla en su ruta declarada— o declarada bloqueada por el club.
- [x] **T25** `AGENT.md` con la puerta de una spec que no toca `domain/` · **Cubre:** todos · **Hecho cuando:** `AGENT.md` → Tests dice que la puerta de una especificación que **no escribe en `domain/`** es otra, y que se mide con `git diff`, con el motivo: sin escribirlo, la siguiente spec de interfaz copia la puerta vacía.

---

## Trazabilidad de RF a tareas

| RF               | Tarea                                                  |
| ---------------- | ------------------------------------------------------ |
| RF-24.1          | T06, T07                                               |
| RF-24.2          | T06, T08                                               |
| RF-24.3          | T06, T09                                               |
| RF-24.4          | T06, T10                                               |
| RF-25.1          | T11                                                    |
| RF-25.2          | T12                                                    |
| RF-26.1, RF-26.2 | T13                                                    |
| RF-27.1          | T14                                                    |
| RF-27.2          | T15                                                    |
| RF-27.3          | T16                                                    |
| RF-28.1, RF-28.2 | T17, T18                                               |
| RF-28.3          | T19                                                    |
| RF-28.4          | **T21, descartada hasta que el club aporte la imagen** |
| RF-28.5          | T20                                                    |
| RF-29.1          | T22                                                    |
| RF-29.2, RF-29.3 | T23                                                    |
| RF-30.1, RF-30.2 | T04                                                    |
| RF-30.3          | T05                                                    |
| RF-30.4          | T01                                                    |
| RF-30.5          | T02                                                    |
| RF-30.6          | T03                                                    |

---

## Notas de mantenimiento

- **La puerta de 003 no es la cobertura.** Constitution IV.1 sigue aplicando, pero como **efecto
  colateral**: si el 100 % de `src/domain/` baja, no significa que 003 lo rompió, porque nadie escribe
  ahí. La puerta de 003 es `git diff --name-only src/domain` vacío, más un test por comportamiento de
  pantalla.
- **T21 es la única descartada**, y está descartada **por el club**, no por dificultad. Se reactiva
  cuando llegue el fichero.
- **RF-30.1 a RF-30.3 son de 002**, no de 003: 003 los asume y lo declara en `spec.md` §0. Si alguien
  busca de quién es cada RF, la tabla de arriba y el §0 lo dicen.
- **Una fase que escriba en `src/domain/` está mal planteada.** Si ocurre, vuelve al plan.
