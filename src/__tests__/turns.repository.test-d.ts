import { expectTypeOf } from 'vitest'
import type {
  TurnAuditChange,
  TurnAuditEntry,
  TurnCorrectEntry,
  TurnDeleteEntry,
  TurnSnapshot,
  UpdateTurnPatch,
} from '@/data/turns.repository'

type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
type Assert<T extends true> = T

/**
 * T02 · RF-30.5 y RF-19.11 de `specs/002`: el registro de correcciones **no tiene campo de motivo**.
 *
 * Estas son las aserciones que `turns.repository.test.ts` no puede hacer: en ejecución no hay forma de
 * preguntar a un tipo si declara algo. Aquí sí, y es la única forma de que **añadir `reason` al tipo**
 * —un cambio de una línea que nadie escribiría nunca, y por tanto que ningún test de ejecución
 * detectaría— rompa `npm run typecheck` (constitution VI.1).
 */
export type _CorrectEntryNoReason = Assert<
  Equals<'reason' extends keyof TurnCorrectEntry ? true : false, false> extends true ? true : false
>
export type _DeleteEntryNoReason = Assert<
  Equals<'reason' extends keyof TurnDeleteEntry ? true : false, false> extends true ? true : false
>
export type _PatchNoReason = Assert<
  Equals<'reason' extends keyof UpdateTurnPatch ? true : false, false> extends true ? true : false
>

// La entrada de corrección lleva exactamente sus cuatro campos: quién, cuándo, qué y el diff.
export type _CorrectEntryFields = Assert<
  Equals<keyof TurnCorrectEntry, 'at' | 'by' | 'action' | 'changes'> extends true ? true : false
>

// La de borrado lleva el turno que desaparece y su foto, no un diff.
export type _DeleteEntryFields = Assert<
  Equals<keyof TurnDeleteEntry, 'at' | 'by' | 'action' | 'turnNo' | 'before'> extends true
    ? true
    : false
>

// Un cambio dice **qué** cambió, de qué valor a cuál y si lo recalculó el sistema. Ni un campo más.
export type _ChangeFields = Assert<
  Equals<keyof TurnAuditChange, 'field' | 'from' | 'to' | 'derived'> extends true ? true : false
>

// `audit[]` es una unión de las dos, y no de tres: ninguna otra rama puede colarse en el registro.
expectTypeOf<TurnAuditEntry>().toEqualTypeOf<TurnCorrectEntry | TurnDeleteEntry>()

// La foto de un turno borrado es el turno entero menos su registro y sus marcas de corrección.
expectTypeOf<TurnSnapshot>().toHaveProperty('turnNo')
expectTypeOf<TurnSnapshot>().not.toHaveProperty('audit')
