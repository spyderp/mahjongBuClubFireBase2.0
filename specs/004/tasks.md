# tasks.md — Tareas de `specs/004`

Listado de trabajo derivado de [`spec.md`](spec.md) y [`plan.md`](plan.md). El plan dice **qué** se
construye y en qué orden; este documento lo parte en tareas de 20 a 30 minutos.

## Cómo se usa

- Cada tarea es un `- [ ]`. **Marca la casilla solo cuando el «Hecho cuando» de esa tarea se cumple.**
- Para saber qué falta:

  ```bash
  grep -c '^- \[ \]' specs/004/tasks.md
  grep -n '^- \[ \]' specs/004/tasks.md
  ```

- Las tareas van en **orden de dependencias**: nada empieza antes de que su bloque termine.
- **Constitution III.1 se verifica al terminar cada tarea**, no al final:

  ```bash
  npm run typecheck && npm run lint && npm run test && npm run format:check
  ```

  `lint` es solo check. Un fallo ajeno al cambio se declara en la respuesta; no se oculta ni se salta un
  paso.

- **La puerta propia de 004 se verifica al terminar cada fase**, y **es la cobertura, no un diff vacío**:
  004 sí escribe en `src/domain/`, así que el 100 % de constitution IV.1 vuelve a ser un umbral
  bloqueante, y el `git diff` del dominio solo puede contener lo que la fase declara.

  ```bash
  git diff --name-only src/domain   # solo lo que §0 de spec.md autoriza
  ```

- El guardián `src/__tests__/trazabilidad.test.ts` se extiende a `specs/004` en la fase 6.

**Estimación:** 28 tareas · 14 a 19 horas. La fase 4 tiene una condición —la dependencia de búsqueda con
etiquetas— que puede quedar **bloqueada** si sus `peerDependencies` no encajan con el stack fijado; si
ocurre, T20 y T21 se declaran bloqueadas y el resto sigue.

---

## Fase 0 · El modelo: contexto de mano y desglose por ganador — 6 tareas

**Primero, porque todo lo demás depende de él.** El formulario, el detalle y la lectura no pueden capturar
ni pintar un contexto que el modelo no sabe guardar.

- [ ] **T01** El contexto de mano en el cálculo · **Cubre:** RF-31.3, RF-31.4, RF-31.5 · **Hecho cuando:** `HandValueInput` (o el tipo que lo sustituya) recibe `isClosedHand` y `hasKan`, y un `describe` nuevo en `yaku.test.ts` barre las cuatro combinaciones sobre un yaku sin condición, uno con `CLOSED_HAND`, uno con `HAS_KAN` y uno con **`NO_KAN`** —el cuarto es el caso donde marcar kan **quita** un yaku (`ippatsu`)—.
- [ ] **T02** El contexto de mano en el turno · **Cubre:** RF-31.1, RF-31.2, RF-31.7 · **Hecho cuando:** `TurnWinnerInput.hand` y `TurnInput` llevan el contexto por ganador, `domain/turn.ts` lo propaga al cálculo, y los valores por defecto (cerrada, sin kan) reproducen el comportamiento anterior a 004 con un test que lo fija.
- [ ] **T03** El contexto sobrevive a la re-derivación · **Cubre:** RF-31.6, RF-31.7, RF-37.1 · **Hecho cuando:** `CapturedTurn` guarda el contexto y `replay.test.ts` comprueba que un turno corregido cambiando el contexto re-deriva con el contexto nuevo y que el `yakuHan` recalculado coincide con el guardado.
- [ ] **T04** El desglose por ganador en el motor · **Cubre:** RF-32.1, RF-32.3 · **Hecho cuando:** un ron con dos ganadores lleva un `hand` por ganador —yaku, `yakuHan`, `yakuHanOverride`, `doraCount`, `fu`—, y `handValue.test.ts` comprueba que el reparto del motor coincide con los dos desgloses capturados.
- [ ] **T05** El documento del turno · **Cubre:** RF-32.4, RF-37.1, RF-37.2 · **Hecho cuando:** `TurnRecord`, `CreateTurnInput`, `UpdateTurnPatch` y `TURN_PATCH_FIELDS` declaran los campos **opcionales** con el comentario de «los turnos escritos antes de `specs/004` no lo tienen», `capturedTurnOf` los proyecta a `CapturedTurn`, y `capturedFieldsBefore` los reconoce por ganador.
- [ ] **T06** El turno anterior a 004 se lee igual · **Cubre:** RF-32.5, RF-37.3, RF-37.4, RF-37.5 · **Hecho cuando:** un `describe` nuevo en `turns.repository.test.ts` lee un turno **sin** los campos nuevos, lo re-deriva, y obtiene el **mismo** resultado que antes de 004; un test afirma que `rulesetVersion` no cambia.

**Decisión de fase.** T01 a T04 son dominio puro y entran en el 100 % de cobertura (IV.1) y con su test
(IV.2). T05 y T06 son `data/`. Ningún módulo de `domain/` fuera de los que declara `plan.md` §3.1 se toca.

---

## Puerta de dominio 0

```bash
git diff --name-only src/domain   # solo handValue.ts, turn.ts, replay.ts
```

La cobertura de `src/domain/` sigue en el **100 %**. Esta puerta se repite al terminar cada fase.

---

## Fase 1 · La captura del contexto y del multi-ron — 4 tareas

Consume la fase 0. Toca el mismo `computed` de la mano y el mismo fichero, así que va entero en una fase
(`plan.md` §5.2, decisión 8).

- [ ] **T07** Abierta/cerrada y kan por ganador · **Cubre:** RF-31.1, RF-31.2 · **Hecho cuando:** el `describe` `'la mano por ganador'` comprueba que cada ganador tiene su control de mano abierta/cerrada y su control de kan, y que los valores por defecto son cerrada y sin kan.
- [ ] **T08** El desglose por ganador en un ron múltiple · **Cubre:** RF-32.1, RF-32.3 · **Hecho cuando:** con un ron de dos ganadores, el formulario ofrece **dos** juegos de yaku, han, ajuste, dora y fu, y el ajuste sigue siendo un delta por ganador sobre la suma del catálogo de ese ganador.
- [ ] **T09** Un solo ganador conserva la forma de siempre · **Cubre:** RF-32.2 · **Hecho cuando:** con un ganador o un tsumo el formulario **no** obliga a rellenar por ganador, y el `describe` `'un solo ganador'` comprueba que la captura y el guardado son los de antes de 004.
- [ ] **T10** Los yaku que no cuentan se señalan por ganador · **Cubre:** RF-31.3, RF-31.4 · **Hecho cuando:** el desglose de cada ganador señala el yaku que no cuenta por el contexto de **ese** ganador, incluido el caso en que marcar kan excluye `ippatsu`.

**Decisión de fase.** La lógica de señalar el yaku ya vive en `domain/yaku.ts` (`unmetConditions`) desde
002; esta fase la alimenta con un contexto real y por ganador. **No se reimplementa en el `.vue`.**

---

## Puerta de dominio 1

```bash
git diff --name-only src/domain   # sin cambios nuevos respecto a la fase 0
```

---

## Fase 2 · Borrar y re-capturar el turno — 3 tareas

La capacidad **ya existe** (`deleteTurn`, `useGameTurns.ts:178`); esta fase es la pantalla que faltaba.

- [ ] **T11** El borrado del último turno con confirmación · **Cubre:** RF-33.1, RF-33.3 · **Hecho cuando:** el `describe` `'borrar el último turno'` comprueba que el detalle ofrece borrar **solo** el último turno con un aviso de confirmación, y que **no** ofrece borrar un turno intermedio.
- [ ] **T12** Borrar usa la capacidad que ya existe · **Cubre:** RF-33.2, RF-33.4, RF-33.6 · **Hecho cuando:** el borrado llama a `deleteTurn` —no reimplementa nada—, levanta la marca de bancarrota si el turno borrado la dejaba puesta, y **rechaza con `staleLocal`** un recuento desfasado explicándolo en pantalla.
- [ ] **T13** Tras borrar, la partida se puede volver a capturar · **Cubre:** RF-33.5, RF-33.7 · **Hecho cuando:** tras borrar el último turno la pantalla queda lista para capturar ese mismo número, y los agregados de temporada **no** cuentan el turno borrado.

**Decisión de fase.** No se escribe ninguna regla nueva en el componente: la renumeración, el registro del
borrado y la reescritura de agregados ya están probados en `useGameTurns.test.ts:716` y
`turns.repository.test.ts` (constitution V.1).

---

## Puerta de dominio 2

```bash
git diff --name-only src/domain   # sin cambios nuevos respecto a la fase 0
```

---

## Fase 3 · El nombre en inglés de los yaku — 2 tareas

- [ ] **T14** Los 46 yaku con su inglés · **Cubre:** RF-34.1, RF-34.2, RF-34.3 · **Hecho cuando:** el grupo `yaku.*` de `es.ts` muestra cada yaku como «japonés (inglés)», el nombre inglés **no** está ni en `domain/yaku.ts` ni en ningún `.vue`, y un `describe` de `locales.test.ts` que enumera los **46** ids del catálogo falla si alguno no tiene inglés. El `describe` **amplía** el que ya existía, no convive con él.
- [ ] **T15** El buscador encuentra por los dos nombres · **Cubre:** RF-34.4 · **Hecho cuando:** escribir parte del nombre japonés o del inglés deja las entradas que coinciden, un filtro sin coincidencia deja la lista vacía **sin perder las marcas**, y limpiar el filtro las devuelve todas.

---

## Puerta de dominio 3

```bash
git diff --name-only src/domain   # sin cambios nuevos respecto a la fase 0
```

---

## Fase 4 · Tokens, tipografía y componentes base — 4 tareas

El rediseño empieza por **el tema y las piezas compartidas**, porque el resto de las pantallas los usan.

- [ ] **T16** Los tokens del tema · **Cubre:** RF-35.1, RF-35.2, RF-35.10 · **Hecho cuando:** los tokens de `src/styles/main.css` tienen los **valores** del documento de estilos manteniendo los **nombres** que ya existen, no hay ningún `tailwind.config.*` en el repositorio, y una búsqueda comprueba que ningún componente escribe un color de la paleta fuera de los tokens.
- [ ] **T17** La tipografía · **Cubre:** RF-35.8 · **Hecho cuando:** las familias del documento se autoalojan, el build las incluye, y las puntuaciones y los marcadores se renderizan en la familia monoespaciada (un test de componente lo comprueba sobre el detalle y la mesa).
- [ ] **T18** La cabecera y los botones CTA · **Cubre:** RF-35.3 · **Hecho cuando:** la cabecera separa navegación y acciones, y las acciones de creación llevan el color de su dominio —verde partida, azul jugador, dorado temporada—.
- [ ] **T19** Los componentes base del tema · **Cubre:** RF-36.1, RF-36.2 · **Hecho cuando:** `BaseButton` y `BaseDialog` usan los tokens del tema **sin** perder ningún `data-test`, `role` ni atajo de accesibilidad, y la suite entera sigue verde **sin editar sus aserciones**. `BaseDialog` conserva su prop `maxWidth` con el mismo valor por defecto.

### Bloqueado por dependencia · RF-35.5

- [ ] **T20** La dependencia de búsqueda con etiquetas · **Cubre:** RF-35.5, RF-36.4 · **Hecho cuando:** la librería está en `package.json` con sus `peerDependencies` **comprobados** contra el stack de la constitución, y su enmienda está escrita en `docs/constitution.md` → Enmiendas y en `AGENT.md` → Stack.

> **T20 puede quedar bloqueada.** Si la librería no se puede fijar contra `typescript ~5.9.3`,
> `vue 3.5.43`, `vite 8.3.2` y Node `^22.12 || ^24 || >=26`, se declara bloqueada y **no** se sustituye por
> una dependencia sin verificar (`plan.md` §2.1). T21 depende de T20.

- [ ] **T21** El selector de yaku con el campo de etiquetas · **Cubre:** RF-35.5 · **Hecho cuando:** el selector de yaku usa el campo de búsqueda con etiquetas conservando el filtrado por los dos nombres y sin perder las marcas de T15.

---

## Puerta de dominio 4

```bash
git diff --name-only src/domain   # sin cambios nuevos respecto a la fase 0
```

---

## Fase 5 · Rediseño por pantalla — 5 tareas

Recorre **todas** las pantallas, no solo las cuatro del documento.

- [ ] **T22** La mesa de captura · **Cubre:** RF-35.4, RF-35.5 · **Hecho cuando:** la captura presenta a los cuatro jugadores como tarjetas en cuadrícula con nombre, viento en etiqueta de color, puntuación en fuente tabular e indicador de riichi, y el ganador se resalta en verde y el perdedor por ron en rojo.
- [ ] **T23** El historial como línea de tiempo · **Cubre:** RF-35.6 · **Hecho cuando:** los turnos anteriores se muestran como línea de tiempo con la variación de puntos en color, y el borrado de T11 se ofrece desde ese historial.
- [ ] **T24** El detalle, el panel y el resto de páginas · **Cubre:** RF-35.9 · **Hecho cuando:** el rediseño alcanza panel, partidas, detalle, jugadores, temporadas y sesión, además de la captura y las estadísticas, y ninguna pantalla queda con el aspecto anterior.
- [ ] **T25** Las estadísticas y las gráficas · **Cubre:** RF-35.7 · **Hecho cuando:** la tabla de clasificación destaca las tres primeras posiciones y enlaza el nombre del jugador, y las gráficas usan la paleta del tema —`charts.test.ts` lo comprueba— en vez de los colores nativos de la librería.
- [ ] **T26** El rediseño no muda reglas a la vista ni desborda · **Cubre:** RF-35.11, RF-36.3 · **Hecho cuando:** ninguna agregación de negocio pasa de `domain/` a un componente para pintarla, y el sistema responde desde 360 px de ancho sin desbordes nuevos (un test de componente lo comprueba en la mesa y en la cabecera).

---

## Puerta de dominio 5

```bash
git diff --name-only src/domain   # sin cambios nuevos respecto a la fase 0
```

---

## Fase 6 · Checklist de salida y enmiendas — 2 tareas

Repite el método de la fase 8 de 002 y la fase 7 de 003.

- [ ] **T27** Los quince puntos del checklist de salida · **Cubre:** todos · **Hecho cuando:** las 15 condiciones de `plan.md` §8 están comprobadas una a una, incluida la 3 —cobertura de `domain/` al 100 %—, la 5 —dos desgloses en un multi-ron— y la 9 —ninguno de los 848 tests existentes editado—, o declaradas bloqueadas con su motivo.
- [ ] **T28** `AGENT.md`, la constitución y el guardián · **Cubre:** todos · **Hecho cuando:** `AGENT.md` → Data model declara los campos nuevos, `AGENT.md` → Tests dice que la puerta de una spec que **sí toca `domain/`** vuelve a ser la cobertura más el diff declarado, `AGENT.md` → Tailwind dice que los tokens cambian de valor y no de nombre, la enmienda de dependencias está escrita, y `trazabilidad.test.ts` lee `specs/004/spec.md` además de `specs/003/spec.md`.

---

## Trazabilidad de RF a tareas

| RF | Tarea |
| -- | ----- |
| RF-31.1, RF-31.2 | T02, T07 |
| RF-31.3, RF-31.4, RF-31.5 | T01, T10 |
| RF-31.6, RF-31.7 | T03 |
| RF-32.1, RF-32.3 | T04, T08 |
| RF-32.2 | T09 |
| RF-32.4 | T05 |
| RF-32.5 | T06 |
| RF-33.1, RF-33.3 | T11 |
| RF-33.2, RF-33.4, RF-33.6 | T12 |
| RF-33.5, RF-33.7 | T13 |
| RF-34.1, RF-34.2, RF-34.3 | T14 |
| RF-34.4 | T15 |
| RF-35.1, RF-35.2, RF-35.10 | T16 |
| RF-35.3 | T18 |
| RF-35.4, RF-35.5 | T22, **T20, T21** |
| RF-35.6 | T23 |
| RF-35.7 | T25 |
| RF-35.8 | T17 |
| RF-35.9 | T24 |
| RF-35.11 | T26 |
| RF-36.1, RF-36.2 | T19 |
| RF-36.3 | T26 |
| RF-36.4 | T20 |
| RF-37.1, RF-37.2 | T05 |
| RF-37.3, RF-37.4, RF-37.5 | T06 |

---

## Notas de mantenimiento

- **La puerta de 004 vuelve a ser la cobertura.** A diferencia de 003, 004 **sí** escribe en
  `src/domain/`, así que el 100 % de constitution IV.1 es un umbral bloqueante y no un efecto colateral.
  El `git diff` del dominio solo puede contener lo que la fase declara.
- **T20 y T21 pueden quedar bloqueadas** por la dependencia de búsqueda con etiquetas. Están bloqueadas
  **por el stack**, no por dificultad, y **no** se sustituyen por una dependencia sin `peerDependencies`
  comprobados.
- **El desglose por ganador solo existe en un ron múltiple.** Un tsumo, un empate, un chombo y un ron de
  un solo ganador conservan la forma de siempre (RF-32.2). Es el caso que más se olvida al implementar.
- **Los turnos anteriores a 004 no se migran.** Los campos nuevos son opcionales y un test fija que un
  turno antiguo se re-deriva igual (RF-37.5).
- **El borrado no inventa nada.** Usa `deleteTurn`, que ya está probado. Si una tarea empieza a
  reimplementar la renumeración o la reescritura de agregados, está mal planteada.
- **Una fase que toque `domain/` fuera de `handValue.ts`, `turn.ts` y `replay.ts` está mal planteada.**
  Si ocurre, vuelve al plan.
