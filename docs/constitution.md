# constitution.md

Principios no negociables del desarrollo de **MahjongBuClub** bajo Spec-Driven Development.

Los principios se citan como `N.M` (capítulo romano, principio decimal) y así los referencia
`AGENT.md`. Cada principio es corto y verificable; el detalle operativo vive en `AGENT.md`, al que
apunta su línea *Ver*. Ninguna tarea se da por terminada sin respetarlos.

---

## I. Especificación

**I.1 — La spec precede al código.** Antes de tocar código se lee esta constitución y la spec
activa en `specs/`. `specs/` no se modifica sin petición explícita.
*Ver: `AGENT.md` → Rules*

## II. Stack

**II.1 — Versiones comprobadas.** El stack se fija con versiones verificadas. Ninguna se sube sin
comprobar los `peerDependencies` del paquete y de quienes dependen de él.

**II.2 — La toolchain no se actualiza a ciegas.** Subir una versión de toolchain es un cambio de
spec, no un `npm update`. El motivo queda escrito junto a la versión.
*Ver: `AGENT.md` → Stack*
> Restricciones vigentes: `typescript-eslint@8` no admite TypeScript ≥ 6.1, y `vitest@5` no admite
> Node 20. Por eso TypeScript está en `~5.9.x` y Node en `^22.12.0 || ^24.0.0 || >=26.0.0`.

> **Enmienda 004-T20:** `@vueform/multiselect@2.6.11` se añade para RF-35.5 (selector de yaku con búsqueda
> por etiquetas). No declara `peerDependencies` explícitas; es compatible con Vue 3. Se comprueba contra
> `typescript ~5.9.3`, `vue 3.5.43`, `vite 8.3.2`. Si en el futuro aparecen conflictos de peers, se
> revisa y la versión se actualiza con justificación en `AGENT.md` y en esta enmienda.

## III. Verificación

**III.1 — Los cuatro en verde, en orden.** `typecheck`, `lint`, `test` y `format:check`, en ese
orden. `lint` es solo check y nunca muta archivos. Un fallo ajeno al cambio se declara en la
respuesta: no se oculta y no se salta un paso para dar por buena la tarea.
*Ver: `AGENT.md` → Al terminar cualquier tarea*

## IV. Tests

**IV.1 — Cobertura del 100 % en `domain/`.** Líneas, ramas y funciones, con los ficheros de test
excluidos del cómputo. Es el único umbral bloqueante; el resto se reporta sin bloquear.

**IV.2 — Ningún caso de negocio sin test.** Toda función pura de `domain/` tiene su test en
`src/__tests__/`, nombrado como el módulo. Una función nueva sin test es trabajo incompleto, no una
deuda aceptable.
*Ver: `AGENT.md` → Tests*

## V. Límites

**V.1 — Firebase no sale de `data/`.** Ningún `.vue` habla con Firestore y ningún repositorio
calcula reglas de negocio. Los cálculos de uma, ranking y agregación viven en `domain/`, que es puro.

**V.2 — Dos stores, ni uno más.** El estado de servidor vive en la caché de `@pinia/colada`, no en
Pinia. Ningún store consume `useQuery()`, porque la query quedaría inmortal y su entrada nunca se
recogería.
*Ver: `AGENT.md` → Regla de capas, Stores*

## VI. Calidad de tipos

**VI.1 — El typecheck es bloqueante.** `strict` y `noUncheckedIndexedAccess` no se relajan. `any`
está prohibido; ante la duda, `unknown` con narrowing explícito.

**VI.2 — El narrowing se hace por `state.status`.** En composables y queries se estrecha desde
`state`, no desde los alias sueltos que expone la librería: los `Ref` individuales no estrechan bajo
`strict`.
*Ver: `AGENT.md` → TypeScript, Contrato de queries y composables*

---

## Enmiendas

Cambiar un principio obliga a actualizar en el mismo commit las referencias `constitution N.M` de
`AGENT.md`. Un principio no se debilita de forma silenciosa: si una restricción estorba, se discute
y se cambia aquí, con su motivo escrito.
