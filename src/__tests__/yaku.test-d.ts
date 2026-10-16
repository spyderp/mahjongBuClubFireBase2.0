import { expectTypeOf } from 'vitest'
import type {
  YakuCondition,
  YakuContext,
  YakuDefinition,
  YakuId,
  NormalYakuId,
  LimitYakuId,
} from '@/domain/yaku'
import type { ResultType } from '@/domain/types'

type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
type Assert<T extends true> = T

// La unión de ids es exactamente la concatenación de normales y de límite, sin huecos.
export type _IdsArePartitioned = Assert<
  Equals<Extract<YakuId, NormalYakuId>, NormalYakuId> extends true ? true : false
>
export type _LimitIsSubsetOfAll = Assert<
  Equals<Extract<YakuId, LimitYakuId>, LimitYakuId> extends true ? true : false
>

// Ningún yaku de límite se cuela en la unión de normales.
export type _NoLimitInNormal = Assert<
  Equals<Extract<LimitYakuId, NormalYakuId>, never> extends true ? true : false
>

// T11: no existe multiplicador por doble yakuman. Si algún día se añade un campo
// `multiplier` a `YakuDefinition`, esta aserción falla y obliga a decidir de nuevo.
export type _NoMultiplierField = Assert<
  Equals<'multiplier' extends keyof YakuDefinition ? true : false, false> extends true
    ? true
    : false
>

// `han` es un número, no una unión de literales, porque el motor lo suma.
expectTypeOf<YakuDefinition['han']>().toEqualTypeOf<number>()

// Los ids son cadenas literales, no `string`: un id inventado no debe asignarse.
expectTypeOf<YakuId>().not.toEqualTypeOf<string>()

// T17: las condiciones son una lista de `YakuCondition`, no un `string` suelto ni un `boolean`.
expectTypeOf<YakuDefinition['conditions']>().toEqualTypeOf<readonly YakuCondition[]>()

// Los siete tipos de condición son los que nombra RF-22.2, ni uno más ni uno menos: añadir un
// octavo obliga a decidir si `yaku.ts` lo comprueba y qué significa en un contexto.
expectTypeOf<YakuCondition['kind']>().toEqualTypeOf<
  'resultType' | 'closedHand' | 'riichiDeclared' | 'hasKan' | 'noKan' | 'firstHand' | 'finalHand'
>()

// Una condición de resultado solo admite tipos de resultado del dominio, nunca texto libre.
expectTypeOf<Extract<YakuCondition, { kind: 'resultType' }>['accepts']>().toEqualTypeOf<
  readonly ResultType[]
>()

// Las demás condiciones no llevan valor: son predicados, no banderas invertibles.
expectTypeOf<Extract<YakuCondition, { kind: 'closedHand' }>>().toEqualTypeOf<{
  readonly kind: 'closedHand'
}>()

// El contexto de la suma tiene los cinco datos que RF-22.2 dice que hay que mirar.
expectTypeOf<YakuContext>().toEqualTypeOf<{
  readonly resultType: ResultType
  readonly isClosedHand: boolean
  readonly hasRiichiDeclared: boolean
  readonly hasKan: boolean
  readonly isFirstHand: boolean
  readonly isFinalHand: boolean
}>()
