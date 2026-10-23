import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot, WriteBatch } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { withBatch } from '@/data/batch'
import { DataError } from '@/data/errors'
import type { CapturedTurn } from '@/domain/replay'
import type { PlayerDelta, TurnValue } from '@/domain/turn'
import type { ResultType, Wind } from '@/domain/types'
import type { GameId, PlayerId } from '@/domain/types'
import type { Timestamp as DomainTimestamp } from '@/domain/types'
import type { YakuId } from '@/domain/yaku'

/**
 * Un valor modificado por una corrección, con el que tenía antes (RF-19.3) y con la marca de si
 * lo recalculó el sistema o lo cambió una persona (RF-19.5). `from` y `to` son `unknown` porque
 * un turno mezcla números, textos, booleanos y listas, y no hay un tipo que los agrupe.
 */
export type TurnAuditChange = {
  readonly field: UpdateTurnPatchField
  readonly from: unknown
  readonly to: unknown
  readonly derived: boolean
}

/**
 * Una corrección de un turno (RF-19.3). Es de **solo anexado**: `update` la añade al final del
 * `audit[]` y ninguna operación modifica ni borra las que ya estaban (RF-19.9).
 *
 * No lleva campo de motivo —la spec lo veta, RF-19.11—: en una corrección de captura el diff ya
 * dice qué pasó.
 */
export type TurnCorrectEntry = {
  readonly at: DomainTimestamp
  readonly by: string
  readonly action: 'correct'
  readonly changes: readonly TurnAuditChange[]
}

/**
 * El borrado de un turno posterior (RF-19.6). Vive en el registro del turno inmediatamente
 * anterior, porque en el borrado se llevaría por delante su propio registro. Cuando no hay turno
 * anterior, la misma entrada va a `games/{gameId}.turnAudit[]` (RF-19.7).
 */
export type TurnDeleteEntry = {
  readonly at: DomainTimestamp
  readonly by: string
  readonly action: 'delete'
  readonly turnNo: number
  readonly before: TurnSnapshot
}

export type TurnAuditEntry = TurnCorrectEntry | TurnDeleteEntry

/**
 * Lo que tenía un turno, sin su registro ni sus marcas de corrección. El turno desaparece al
 * borrarse, pero lo que contenía tiene que poder leerse después desde la partida o desde el turno
 * anterior, y ahí no cabe el `audit[]` de un turno que ya no existe.
 */
export type TurnSnapshot = Omit<TurnRecord, 'audit' | 'createdAt' | 'updatedBy' | 'updatedAt'>

/**
 * El contexto de la mano de **un** ganador (RF-31.7): si la mano estaba abierta o cerrada y si tuvo
 * kan.
 *
 * Opcional en el documento porque los turnos escritos antes de `specs/004` no lo tienen: se leen
 * como antes, sin contexto, y no se re-puntúan (RF-37.2 y RF-37.3).
 */
export type WinnerHandContext = {
  readonly playerId: PlayerId
  readonly isClosedHand: boolean
  readonly hasKan: boolean
}

/**
 * El desglose de la mano de **un** ganador (RF-32.1): sus yaku, su han de yaku, su ajuste a mano, su
 * número de dora y sus fu.
 *
 * Solo existe en un ron múltiple (RF-32.2): un turno con un solo ganador, o un tsumo, sigue
 * guardando el desglose con la forma de siempre, en los campos del turno.
 *
 * Opcional en el documento porque los turnos escritos antes de `specs/004` no lo tienen (RF-37.2).
 */
export type WinnerHandBreakdown = {
  readonly playerId: PlayerId
  readonly yaku: readonly YakuId[]
  readonly yakuHan: number
  readonly yakuHanOverride: number
  readonly doraCount: number
  readonly fu: number
}

export type TurnRecord = {
  readonly turnNo: number
  readonly wind: Wind
  readonly dealerId: PlayerId
  readonly honba: number
  readonly resultType: ResultType
  readonly yaku: readonly YakuId[]
  /**
   * Han de yaku **derivado** de `domain/yaku.ts` (RF-22.1): sale de lo que cuenta en esta mano, no
   * de lo que escribió quien captura.
   */
  readonly yakuHan: number
  /**
   * Ajuste a mano de los han, como **delta** sobre la suma del catálogo (RF-22.9). Vive aparte del
   * total a propósito: es lo que distingue lo que aportó el catálogo de lo que aportó la persona, y
   * lo que deja el total derivable reaplicando el ajuste sobre la suma.
   */
  readonly yakuHanOverride: number
  readonly doraCount: number
  readonly fu: number
  readonly tenpai: readonly PlayerId[]
  readonly riichiDeclaredBy: readonly PlayerId[]
  readonly riichiSticks: number
  readonly value: readonly TurnValue[]
  readonly deltas: readonly PlayerDelta[]
  /**
   * A quién se descartó en un ron y a quién se penalizó con un chombo. Los dos son **captura**, no
   * cálculo (RF-18.13), pero sin ellos un ron o un chombo guardado no se puede volver a resolver:
   * son los dos campos que el documento de Firestore le faltaba a `domain/replay.ts` para poder
   * recorrer una partida tal y como está escrita. `null` cuando el turno no es de ese tipo.
   */
  readonly discarderId: PlayerId | null
  readonly chomboId: PlayerId | null
  /** Quién escribió la versión original. Inmutable: corregir no lo cambia (RF-19.1). */
  readonly capturedBy: string
  readonly updatedBy: string | null
  readonly updatedAt: DomainTimestamp | null
  readonly isRenchan: boolean
  readonly isFinalTurn: boolean
  /**
   * El contexto de la mano de cada ganador (RF-31.7).
   *
   * Opcional porque los turnos escritos antes de `specs/004` no lo tienen: se leen como antes, sin
   * contexto, y no se re-puntúan (RF-37.2 y RF-37.3).
   */
  readonly handContext?: readonly WinnerHandContext[]
  /**
   * El desglose de la mano de cada ganador (RF-32.1).
   *
   * Solo lo tiene un ron múltiple (RF-32.2), y es opcional porque los turnos escritos antes de
   * `specs/004` no lo tienen (RF-37.2).
   */
  readonly winnerHands?: readonly WinnerHandBreakdown[]
  readonly audit: readonly TurnAuditEntry[]
  readonly createdAt: DomainTimestamp
}

export type CreateTurnInput = Omit<TurnRecord, 'createdAt' | 'audit' | 'updatedBy' | 'updatedAt'>

export type UpdateTurnPatch = {
  readonly wind?: Wind
  readonly dealerId?: PlayerId
  readonly honba?: number
  readonly resultType?: ResultType
  readonly yaku?: readonly YakuId[]
  readonly yakuHan?: number
  readonly yakuHanOverride?: number
  readonly doraCount?: number
  readonly fu?: number
  readonly tenpai?: readonly PlayerId[]
  readonly riichiDeclaredBy?: readonly PlayerId[]
  readonly riichiSticks?: number
  readonly value?: readonly TurnValue[]
  readonly deltas?: readonly PlayerDelta[]
  readonly discarderId?: PlayerId | null
  readonly chomboId?: PlayerId | null
  readonly isRenchan?: boolean
  readonly isFinalTurn?: boolean
  /** Opcional: los turnos escritos antes de `specs/004` no lo tienen (RF-37.2). */
  readonly handContext?: readonly WinnerHandContext[]
  /** Opcional: los turnos escritos antes de `specs/004` no lo tienen (RF-37.2). */
  readonly winnerHands?: readonly WinnerHandBreakdown[]
}

/**
 * Los campos que `update` sabe cambiar, en el orden en que salen en `audit[].changes`. La lista y
 * el tipo son la misma cosa: `TurnAuditChange.field` sale de aquí, así que un campo del parche que
 * se añadiera al tipo y no a la lista dejaría de auditarse sin que nada lo dijera.
 */
export const TURN_PATCH_FIELDS = [
  'wind',
  'dealerId',
  'honba',
  'resultType',
  'yaku',
  'yakuHan',
  'yakuHanOverride',
  'doraCount',
  'fu',
  'tenpai',
  'riichiDeclaredBy',
  'riichiSticks',
  'value',
  'deltas',
  'discarderId',
  'chomboId',
  'isRenchan',
  'isFinalTurn',
  'handContext',
  'winnerHands',
] as const satisfies readonly (keyof UpdateTurnPatch)[]

export type UpdateTurnPatchField = (typeof TURN_PATCH_FIELDS)[number]

/**
 * Contexto de una corrección (RF-19.2, RF-19.5 y RF-19.12).
 *
 * `expectedAuditCount` es el número de entradas de registro que el llamante leyó: si al escribir
 * el registro tiene otra longitud, es que alguien más corrigió el turno entre medias y esta
 * escritura perdería su corrección, así que se rechaza antes de encolar nada.
 */
export type UpdateTurnOptions = {
  /** `WriteBatch` compartido: la corrección se encola y no se confirma hasta que quien lo posee confirma. */
  readonly batch?: WriteBatch
  /** Quién corrige. Va en `updatedBy` y en la entrada de `audit[]`. */
  readonly by: string
  /** Cuántas entradas de `audit[]` había leídas (RF-19.12). */
  readonly expectedAuditCount: number
  /** Campos del parche que ha calculado el sistema y no una persona (RF-19.5). */
  readonly derived?: readonly UpdateTurnPatchField[]
  /**
   * Renumera el turno: lee de `turnNo` y escribe en este otro, borrando el de origen (RF-18.9).
   * Existe porque borrar un turno intermedio deja un hueco y la numeración es correlativa, así que
   * sin esto el turno borrado no se podría volver a capturar. No es un `update` normal porque el
   * identificador del documento también cambia.
   */
  readonly moveToTurnNo?: number
  /**
   * Anota en el registro de **este** turno el borrado del siguiente (RF-19.6), que es el único
   * sitio donde puede sobrevivir. No cuenta como corrección del turno: no cambia ningún campo suyo.
   */
  readonly deletedTurn?: { readonly turnNo: number; readonly before: TurnSnapshot }
}

/** Contexto de un borrado (RF-18.10 y RF-18.18). */
export type RemoveTurnOptions = {
  /**
   * Que este borrado pide la excepción al veto de bancarrota porque es el de una partida marcada.
   * **No es un permiso**: `remove` comprueba que el turno sea de verdad el último, y que la marca se
   * levante lo decide `domain/replay.ts` en `useGameTurns`.
   */
  readonly waivesBankruptcy?: boolean
}

/** Firestore admite 1 MiB por documento (RF-19.14). */
export const FIRESTORE_DOCUMENT_LIMIT_BYTES = 1_048_576

type TurnData = {
  readonly turnNo: number
  readonly wind: Wind
  readonly dealerId: PlayerId
  readonly honba: number
  readonly resultType: ResultType
  readonly yaku: readonly YakuId[]
  readonly yakuHan: number
  /** Opcional porque los turnos escritos antes de `specs/002` no lo tienen (RF-22.9). */
  readonly yakuHanOverride?: number
  readonly doraCount: number
  readonly fu: number
  readonly tenpai: readonly PlayerId[]
  readonly riichiDeclaredBy: readonly PlayerId[]
  readonly riichiSticks: number
  readonly value: readonly TurnValue[]
  readonly deltas: readonly PlayerDelta[]
  readonly discarderId: PlayerId | null
  readonly chomboId: PlayerId | null
  readonly capturedBy: string
  readonly updatedBy?: string
  readonly updatedAt?: DomainTimestamp
  readonly isRenchan: boolean
  readonly isFinalTurn: boolean
  /** Opcional porque los turnos escritos antes de `specs/004` no lo tienen (RF-37.2). */
  readonly handContext?: readonly WinnerHandContext[]
  /** Opcional porque los turnos escritos antes de `specs/004` no lo tienen (RF-37.2). */
  readonly winnerHands?: readonly WinnerHandBreakdown[]
  /** Opcional porque los turnos escritos antes de `specs/002` no lo tienen. */
  readonly audit?: readonly TurnAuditEntry[]
  readonly createdAt: DomainTimestamp
}

type GameStatusData = {
  readonly status: 'open' | 'finalized' | 'unfinished' | 'aborted'
  readonly mustFinalize: boolean
}

/**
 * Por qué se está escribiendo en un turno. No es un permiso: es lo que permite que
 * `assertOpenGame` distinga la **única** excepción al veto de RF-18.18. `deleteLast` no se concede
 * sola —`remove` la verifica contra los turnos guardados—, pero quien la pide es siempre
 * `useGameTurns`, que ya ha hecho el trabajo de dominio.
 */
type TurnWriteIntent = 'create' | 'correct' | 'delete' | 'deleteLast'

/**
 * RF-3.1 a RF-3.8, RF-18.10 y RF-19.1 a RF-19.5: turnos de una partida. La numeración es
 * correlativa y sin huecos (AGENT.md → Data model): el identificador es el número del turno
 * **sin relleno**, y el orden lo fija el campo numérico `turnNo`, nunca el identificador
 * (RF-20.1 y RF-20.2). Registrar un turno solo es válido sobre una partida `open`, y además
 * refresca `updatedAt` del juego para la regla de los 7 días (RF-10.4). El rechazo del turno
 * duplicado es la política de resolución de la captura sin conexión (AGENT.md → Captura sin
 * conexión).
 *
 * Corregir no es escribir encima: `update` exige decir cuántas correcciones se han leído, deja
 * `capturedBy` intacto y anexa su entrada de registro sin tocar las anteriores (RF-19.9).
 */
export const turnsRepository = {
  async list(gameId: GameId): Promise<TurnRecord[]> {
    const snap = await getDocs(
      query(collection(getDb(), 'games', gameId, 'turns'), orderBy('turnNo', 'asc')),
    )

    return snap.docs.map(toRecord)
  },

  create(gameId: GameId, input: CreateTurnInput, batch?: WriteBatch): Promise<TurnRecord> {
    return withBatch(batch, async (current) => {
      await assertOpenGame(gameId, 'create')
      await assertSequentialTurn(gameId, input.turnNo)

      const ref = doc(collection(getDb(), 'games', gameId, 'turns'), turnDocId(input.turnNo))
      const now = Timestamp.now()

      current.set(ref, { ...input, audit: [], createdAt: serverTimestamp() })
      current.update(doc(getDb(), 'games', gameId), { updatedAt: serverTimestamp() })

      return { ...input, audit: [], updatedBy: null, updatedAt: null, createdAt: now }
    })
  },

  update(
    gameId: GameId,
    turnNo: number,
    patch: UpdateTurnPatch,
    options: UpdateTurnOptions,
  ): Promise<TurnRecord> {
    return withBatch(options.batch, async (current) => {
      /**
       * Una escritura que anota el borrado de un turno posterior es parte de ese borrado, y por eso
       * no la veta la marca de bancarrota igual que no lo veta el propio `remove`. Las dos van
       * siempre juntas: `useGameTurns` borra primero y anota después.
       */
      await assertOpenGame(gameId, options.deletedTurn !== undefined ? 'deleteLast' : 'correct')

      const targetTurnNo = options.moveToTurnNo ?? turnNo
      const turns = collection(getDb(), 'games', gameId, 'turns')
      const ref = doc(turns, turnDocId(turnNo))
      const snapshot = await getDoc(ref)
      const stored = snapshot.data() as unknown as TurnData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      const audit = stored.audit ?? []

      /**
       * RF-19.12: el número de correcciones es el número de versión del turno. Si no es el que
       * leyó quien corrige, otra escritura ocurrió entre medias y aplicar el parche sobre ella
       * perdería su corrección sin dejar rastro. Se rechaza antes de encolar nada, así que el
       * `WriteBatch` compartido tampoco queda envenenado.
       */
      if (audit.length !== options.expectedAuditCount) {
        throw new DataError('conflict')
      }

      const now = Timestamp.now()
      const changes = changesOf(stored, patch, options.derived ?? [])
      const appended = [...audit, ...newEntries(changes, options, now)]
      const last = appended[appended.length - 1]
      const next: TurnRecord = {
        ...mergePatch(stored, patch, targetTurnNo),
        audit: appended,
        /**
         * Quién corrigió por última vez lo dice **la última entrada del registro**, no esta
         * operación: renumerar un turno no lo corrige, y si se tomara el `by` de quien renumera
         * se perdería quién lo corrigió antes (RF-19.2).
         */
        updatedBy: last?.by ?? null,
        updatedAt: last?.at ?? null,
        createdAt: stored.createdAt,
      }

      /**
       * RF-19.14: el registro solo crece, y Firestore admite 1 MiB por documento. Se comprueba
       * antes de encolar, con el turno nombrado, porque el rechazo de Firestore llegaría a la mesa
       * como un `failed-precondition` sin decir qué turno ni por qué.
       */
      if (documentSizeOf(next) > FIRESTORE_DOCUMENT_LIMIT_BYTES) {
        throw new DataError(
          'auditFull',
          `El registro del turno ${turnNo} ha alcanzado su límite de tamaño`,
        )
      }

      current.set(doc(turns, turnDocId(targetTurnNo)), {
        ...withoutCorrectionFields(next),
        createdAt: serverTimestamp(),
      })

      if (targetTurnNo !== turnNo) {
        current.delete(ref)
      }

      current.update(doc(getDb(), 'games', gameId), { updatedAt: serverTimestamp() })

      return next
    })
  },

  /**
   * RF-18.10: borra el turno. Devuelve lo que había, porque el registro del borrado necesita los
   * valores que tenía (RF-19.6) y porque quien lo llama necesita saber qué número queda libre.
   */
  remove(
    gameId: GameId,
    turnNo: number,
    batch?: WriteBatch,
    options?: RemoveTurnOptions,
  ): Promise<TurnRecord> {
    return withBatch(batch, async (current) => {
      const waived = options?.waivesBankruptcy === true

      await assertOpenGame(gameId, waived ? 'deleteLast' : 'delete')

      /**
       * Pedir la excepción no la concede. Aquí es donde se comprueba la parte del acuerdo que es
       * dato —que el turno borrado sea el último de la partida—; la otra parte, que la partida quede
       * sin nadie por debajo de cero, la decide el recorrido y no se puede saber aquí.
       */
      if (waived && !(await isLastTurn(gameId, turnNo))) {
        throw new DataError('notLastTurn')
      }

      const ref = doc(collection(getDb(), 'games', gameId, 'turns'), turnDocId(turnNo))
      const stored = (await getDoc(ref)).data() as unknown as TurnData | undefined

      if (stored === undefined) {
        throw new DataError('notFound')
      }

      current.delete(ref)
      current.update(doc(getDb(), 'games', gameId), { updatedAt: serverTimestamp() })

      return toTurnRecord(stored)
    })
  },

  /** RF-3.8: siguiente número de turno sin huecos: el máximo registrado más uno. */
  async nextNumber(gameId: GameId): Promise<number> {
    await assertExists(gameId)
    const snap = await getDocs(
      query(collection(getDb(), 'games', gameId, 'turns'), orderBy('turnNo', 'asc')),
    )

    return snap.docs.reduce((max, snapshot) => Math.max(max, turnNoOf(snapshot)), 0) + 1
  },
}

/**
 * RF-18.13: el recorrido de `domain/replay.ts` solo necesita lo que **escribió quien capturó**,
 * porque la ronda, la localía y el honba se derivan y el resto se vuelve a calcular (RF-18.8). Este
 * es el adaptador entre el documento de Firestore y `CapturedTurn`, que es un tipo distinto a
 * propósito: el recorrido no debe ver `capturedBy`, `audit[]` ni nada que él mismo escribe.
 *
 * El `patch` se aplica antes de proyectar, y no después, porque lo que se re-deriva es la partida
 * **ya corregida**: cambiar el resultado del turno 2 cambia lo que los siguientes resolvieron
 * (RF-18.7). Por eso los campos se leen con `!== undefined` y no con `??`: en `discarderId` y
 * `chomboId` un `null` explícito vale —«este turno no tiene descartador»— y `??` lo confundiría
 * con «no informado».
 */
export function capturedTurnOf(record: TurnRecord, patch: UpdateTurnPatch = {}): CapturedTurn {
  const yaku = patch.yaku ?? record.yaku
  const yakuHan = patch.yakuHan ?? record.yakuHan
  const doraCount = patch.doraCount ?? record.doraCount
  const fu = patch.fu ?? record.fu
  const handContext = patch.handContext ?? record.handContext
  const winnerHands = patch.winnerHands ?? record.winnerHands
  const yakuHanOverride = patch.yakuHanOverride ?? record.yakuHanOverride

  /**
   * T44 · Los ganadores son **captura**, no estado derivado: `CapturedTurn` los lleva aparte de
   * `value[]` precisamente porque el recorrido necesita saber quién ganó antes de resolver los pagos.
   * Salen del parche cuando lo hay, igual que el resto de campos capturados —sin esto, corregir un
   * ron para que ganen otros jugadores re-derivaba la partida con los ganadores viejos y RNF-1 era
   * indemostrable, porque no había forma de converger hacia una captura distinta.
   *
   * `deltas`, en cambio, **no** se lee aquí: son estado derivado y los recalcula el recorrido
   * (RF-18.8).
   */
  const winners = (patch.value ?? record.value).map((entry) => entry.playerId)

  /**
   * RF-31.7: el contexto de la mano viaja a la captura para que el recorrido vuelva a contar los
   * yaku con el mismo contexto con el que se capturaron. La mano del turno es la del **primer**
   * ganador (RF-32.2), así que su contexto es el de ese ganador.
   *
   * Sin contexto —un turno escrito antes de `specs/004`— la mano conserva su forma de siempre y no
   * se le añade ni el ajuste ni los dos campos nuevos: los turnos antiguos no se re-puntúan
   * (RF-37.3).
   */
  const context = contextOf(handContext, winners[0])
  const hand = {
    yaku,
    yakuHan,
    doraCount,
    fu,
    ...(context.isClosedHand === undefined && context.hasKan === undefined
      ? {}
      : { ...context, yakuHanOverride }),
  }

  return {
    turnNo: record.turnNo,
    resultType: patch.resultType ?? record.resultType,
    hand,
    /**
     * RF-32.1: el desglose por ganador solo existe en un ron múltiple, y solo se proyecta cuando el
     * turno lo trae. Un turno que no lo tiene no gana un campo vacío: se queda con la forma que
     * tenía (RF-32.5).
     */
    ...(winnerHands === undefined
      ? {}
      : {
          winnerHands: winnerHands.map((breakdown) => ({
            playerId: breakdown.playerId,
            hand: {
              yaku: breakdown.yaku,
              yakuHan: breakdown.yakuHan,
              yakuHanOverride: breakdown.yakuHanOverride,
              doraCount: breakdown.doraCount,
              fu: breakdown.fu,
              ...contextOf(handContext, breakdown.playerId),
            },
          })),
        }),
    winners,
    discarderId: patch.discarderId !== undefined ? patch.discarderId : record.discarderId,
    chomboId: patch.chomboId !== undefined ? patch.chomboId : record.chomboId,
    tenpai: patch.tenpai ?? record.tenpai,
    riichiDeclaredBy: patch.riichiDeclaredBy ?? record.riichiDeclaredBy,
  }
}

/**
 * El contexto de la mano de un ganador, o el que no hay si ese turno no lo trae (RF-37.3).
 */
function contextOf(
  contexts: readonly WinnerHandContext[] | undefined,
  playerId: PlayerId | undefined,
): { readonly isClosedHand?: boolean; readonly hasKan?: boolean } {
  if (contexts === undefined || playerId === undefined) {
    return {}
  }

  const context = contexts.find((entry) => entry.playerId === playerId)

  if (context === undefined) {
    return {}
  }

  return { isClosedHand: context.isClosedHand, hasKan: context.hasKan }
}

/** Los valores de un turno sin su registro: lo que deja el borrado de ese turno (RF-19.6). */
export function toTurnSnapshot(record: TurnRecord): TurnSnapshot {
  const {
    audit: _audit,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    updatedBy: _updatedBy,
    ...values
  } = record

  return values
}

/**
 * Los campos **derivados** de un turno, que son los que RF-30.2 nombra y los que la reconstrucción
 * no puede tomar del registro: la ronda, la localía, el contador, los valores de la mano y sus
 * deltas. La lista es **cerrada** y es la de la spec; el resto de `TURN_PATCH_FIELDS` es lo que
 * escribió quien capturó.
 *
 * El bote de riichi va aquí por el mismo motivo que los otros cinco, aunque el enumerado de RF-30.2
 * no lo mencione: RF-18.8 lo cuenta entre los que «el sistema vuelve a calcular» y `useGameTurns` lo
 * marca como `derived` en cada corrección. Devolverlo como si lo hubiera escrito una persona sería
 * restituir un valor calculado a mano —que es lo que RF-30.2 veta— y además dejaría el turno
 * anterior con un bote que el recorrido ya no ha visto.
 *
 * La lista es la misma que la de `useGameTurns` —`DERIVED_FIELDS`—, y las dos tienen que coincidir
 * campo a campo: si se separan, la reconstrucción restituye un derivado que el sistema va a
 * recalcular y encima lo da por bueno.
 */
const DERIVED_TURN_FIELDS = [
  'wind',
  'dealerId',
  'honba',
  'riichiSticks',
  'value',
  'deltas',
] as const satisfies readonly UpdateTurnPatchField[]

function isDerivedTurnField(field: UpdateTurnPatchField): boolean {
  return DERIVED_TURN_FIELDS.some((derived) => derived === field)
}

/**
 * RF-30.1 y RF-30.2: los valores que tenía un turno **antes de su última corrección**, leídos de la
 * entrada más reciente del registro y **solo de sus campos capturados**.
 *
 * No es un deshacer campo a campo. Los derivados no se restituyen, porque RF-18.13 los recalcula el
 * sistema y volver a escribir a mano un valor calculado contradice esa regla en el mismo cambio que la
 * cumple. Quien use esto repone lo que escribió una persona y vuelve a derivar la partida: es un
 * parche para `capturedTurnOf` más un recorrido, no un `update` con el `from` de todo.
 *
 * Se lee la última entrada **de corrección** y no la última entrada a secas, porque el borrado del
 * turno siguiente (RF-19.6) comparte el mismo array y no cambia ningún campo de este: si tapara la
 * corrección anterior, «la versión anterior» dejaría de existir justo cuando más hace falta.
 *
 * Es una proyección de un documento, como `capturedTurnOf` y `toTurnSnapshot`, y por eso vive aquí y
 * no en `domain/`.
 */
export function capturedFieldsBefore(record: TurnRecord): Readonly<Partial<UpdateTurnPatch>> {
  const last = record.audit.findLast((entry) => entry.action === 'correct')

  if (last === undefined) {
    return {}
  }

  const previous: Partial<Record<UpdateTurnPatchField, unknown>> = {}
  const perWinner = new Map<UpdateTurnPatchField, TurnAuditChange[]>()

  for (const change of last.changes) {
    if (isDerivedTurnField(change.field)) {
      continue
    }

    /**
     * RF-32.4: un cambio por ganador se reconoce como tal. Los cambios de un mismo campo por
     * ganador se juntan para rehacer el campo entero, ganador a ganador.
     */
    if (playerIdOf(change.to) !== undefined || playerIdOf(change.from) !== undefined) {
      const changes = perWinner.get(change.field) ?? []
      changes.push(change)
      perWinner.set(change.field, changes)
      continue
    }

    previous[change.field] = change.from
  }

  /**
   * Los campos por ganador se rehacen desde el valor **actual**: a cada ganador cambiado se le
   * devuelve el valor que tenía, y el que no ha cambiado se queda como está. Así lo que sale es el
   * desglose de antes de la corrección, ganador a ganador.
   */
  for (const [field, changes] of perWinner) {
    previous[field] = previousWinners(record, field, changes)
  }

  /**
   * El único punto del repositorio donde `unknown` se estrecha: `from` es `unknown` porque un turno
   * mezcla números, textos, booleanos y listas y no hay un tipo que los agrupe, pero el `field` que
   * trae la entrada es una clave de `TURN_PATCH_FIELDS` y el valor lo escribió `update` leyendo ese
   * mismo campo del documento. El cast va en la salida, una vez, y no en la firma.
   */
  return previous as Partial<UpdateTurnPatch>
}

/**
 * El valor que tenía un campo por ganador antes de la corrección (RF-32.4).
 */
function previousWinners(
  record: TurnRecord,
  field: UpdateTurnPatchField,
  changes: readonly TurnAuditChange[],
): unknown {
  const restored = byWinner(record[field])

  for (const change of changes) {
    const playerId = playerIdOf(change.to) ?? playerIdOf(change.from)

    if (playerId === undefined) {
      continue
    }

    if (change.from === undefined) {
      restored.delete(playerId)
      continue
    }

    restored.set(playerId, change.from)
  }

  return [...restored.values()]
}

function toRecord(snapshot: QueryDocumentSnapshot): TurnRecord {
  return toTurnRecord(snapshot.data() as unknown as TurnData)
}

/**
 * Normaliza a la forma pública del registro: un turno escrito antes de que existiera el registro
 * de correcciones, o que nunca se ha corregido, no tiene `audit`, `updatedBy` ni `updatedAt` en el
 * documento, y quien lo lee tiene que poder tratarlos igual sin preguntar primero por qué faltan.
 */
function toTurnRecord(stored: TurnData): TurnRecord {
  const { audit, updatedBy, updatedAt, ...fields } = stored

  return {
    ...fields,
    yakuHanOverride: fields.yakuHanOverride ?? 0,
    updatedBy: updatedBy ?? null,
    updatedAt: updatedAt ?? null,
    audit: audit ?? [],
  }
}

/** El documento omite `updatedBy` y `updatedAt` mientras no haya ninguna corrección. */
function withoutCorrectionFields(record: TurnRecord): Record<string, unknown> {
  const { updatedBy, updatedAt, ...fields } = record

  return updatedBy === null ? fields : { ...fields, updatedBy, updatedAt }
}

function turnNoOf(snapshot: QueryDocumentSnapshot): number {
  return (snapshot.data() as unknown as TurnData).turnNo
}

/**
 * Los cambios que el parche produce de verdad, en el orden de `TURN_PATCH_FIELDS` y no en el del
 * objeto que llega: el registro se lee igual aunque quien llama escriba las claves en otro orden
 * (RNF-1).
 */
function changesOf(
  stored: TurnData,
  patch: UpdateTurnPatch,
  derived: readonly UpdateTurnPatchField[],
): readonly TurnAuditChange[] {
  const changes: TurnAuditChange[] = []

  for (const field of TURN_PATCH_FIELDS) {
    const next = patch[field]

    if (next === undefined) {
      continue
    }

    /**
     * RF-32.4: el contexto y el desglose son **por ganador**, así que se auditan ganador a
     * ganador: corregir la mano de un ganador no cuenta como corregir la de los demás.
     *
     * Si el valor no es una lista de ganadores no hay nada por ganador que decir, y el campo se
     * audita como cualquier otro.
     */
    if (field === 'handContext' || field === 'winnerHands') {
      const perWinner = winnerChangesOf(field, stored[field], next, derived.includes(field))

      if (perWinner !== undefined) {
        changes.push(...perWinner)
        continue
      }
    }

    if (isSameValue(stored[field], next)) {
      continue
    }

    changes.push({ field, from: stored[field], to: next, derived: derived.includes(field) })
  }

  return changes
}

/**
 * Los cambios de un campo **por ganador** (RF-32.4): una entrada por ganador cambiado.
 *
 * La entrada lleva el valor de **ese** ganador —su desglose o su contexto—, no el del campo entero:
 * así se ve qué ganador cambió y los demás no cuentan como cambiados. El ganador se reconoce por el
 * `playerId` que lleva el propio valor, que es lo que permite rehacer el campo después.
 */
function winnerChangesOf(
  field: 'handContext' | 'winnerHands',
  stored: unknown,
  next: unknown,
  derived: boolean,
): readonly TurnAuditChange[] | undefined {
  const changes: TurnAuditChange[] = []
  const before = byWinner(stored)
  const after = byWinner(next)

  if (before.size === 0 && after.size === 0) {
    return undefined
  }

  for (const [playerId, value] of after) {
    const previous = before.get(playerId)

    if (previous !== undefined && isSameValue(previous, value)) {
      continue
    }

    changes.push({ field, from: previous, to: value, derived })
  }

  for (const [playerId, previous] of before) {
    if (!after.has(playerId)) {
      changes.push({ field, from: previous, to: undefined, derived })
    }
  }

  return changes
}

/**
 * Un campo por ganador, indexado por jugador. Lo que no es de esta forma —un turno antiguo sin el
 * campo, o un campo que no es por ganador— no tiene ganador y se queda vacío.
 */
function byWinner(value: unknown): Map<PlayerId, unknown> {
  const entries = new Map<PlayerId, unknown>()

  if (!Array.isArray(value)) {
    return entries
  }

  for (const entry of value as readonly unknown[]) {
    const playerId = playerIdOf(entry)

    if (playerId !== undefined) {
      entries.set(playerId, entry)
    }
  }

  return entries
}

/**
 * El ganador de un valor por ganador, si lo tiene (RF-32.4). El campo entero es una lista de
 * ganadores y no tiene `playerId`; un ganador es uno con el suyo.
 */
function playerIdOf(value: unknown): PlayerId | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const candidate = (value as { readonly playerId?: unknown }).playerId

  return typeof candidate === 'string' ? (candidate as PlayerId) : undefined
}

/**
 * Comparación por valor y no por identidad: dos listas con los mismos yaku son el mismo yaku, y un
 * parche que reescribe lo mismo no es una corrección. Las claves del objeto se ordenan antes de
 * comparar para que `{ a, b }` y `{ b, a }` no cuenten como dos manos distintas.
 */
function isSameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

function canonicalJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, inner: unknown) =>
      typeof inner === 'object' && inner !== null && !Array.isArray(inner)
        ? Object.fromEntries(
            Object.entries(inner).sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            ),
          )
        : inner,
    ) ?? 'undefined'
  )
}

/** Tamaño del documento tal y como se guardaría, para no llegar al límite de Firestore. */
function documentSizeOf(record: TurnRecord): number {
  return new TextEncoder().encode(JSON.stringify(record)).length
}

function mergePatch(
  stored: TurnData,
  patch: UpdateTurnPatch,
  turnNo: number,
): Omit<TurnRecord, 'audit' | 'createdAt' | 'updatedAt' | 'updatedBy'> {
  const handContext = patch.handContext ?? stored.handContext
  const winnerHands = patch.winnerHands ?? stored.winnerHands

  return {
    turnNo,
    wind: patch.wind ?? stored.wind,
    dealerId: patch.dealerId ?? stored.dealerId,
    honba: patch.honba ?? stored.honba,
    resultType: patch.resultType ?? stored.resultType,
    yaku: patch.yaku ?? stored.yaku,
    yakuHan: patch.yakuHan ?? stored.yakuHan,
    yakuHanOverride: patch.yakuHanOverride ?? stored.yakuHanOverride ?? 0,
    doraCount: patch.doraCount ?? stored.doraCount,
    fu: patch.fu ?? stored.fu,
    tenpai: patch.tenpai ?? stored.tenpai,
    riichiDeclaredBy: patch.riichiDeclaredBy ?? stored.riichiDeclaredBy,
    riichiSticks: patch.riichiSticks ?? stored.riichiSticks,
    value: patch.value ?? stored.value,
    deltas: patch.deltas ?? stored.deltas,
    discarderId: patch.discarderId !== undefined ? patch.discarderId : stored.discarderId,
    chomboId: patch.chomboId !== undefined ? patch.chomboId : stored.chomboId,
    capturedBy: stored.capturedBy,
    isRenchan: patch.isRenchan ?? stored.isRenchan,
    isFinalTurn: patch.isFinalTurn ?? stored.isFinalTurn,
    /**
     * Los campos nuevos solo se escriben cuando los hay: un turno anterior a `specs/004` no los
     * tiene y no se los inventa (RF-37.2 y RF-37.3).
     */
    ...(handContext === undefined ? {} : { handContext }),
    ...(winnerHands === undefined ? {} : { winnerHands }),
  }
}

/**
 * Las entradas que esta operación **añade** al registro. Una corrección que no cambia nada no
 * deja entrada: el registro se llenaría de correcciones vacías y RF-19.14 acabaría rechazando un
 * turno que sí se podría seguir corrigiendo. El borrado del turno siguiente es otra entrada y sí
 * cuenta aunque el turno no cambie de valor: algo pasó, y RNF-2 exige que se vea.
 */
function newEntries(
  changes: readonly TurnAuditChange[],
  options: UpdateTurnOptions,
  now: DomainTimestamp,
): readonly TurnAuditEntry[] {
  const entries: TurnAuditEntry[] = []

  if (changes.length > 0) {
    entries.push({ at: now, by: options.by, action: 'correct', changes })
  }

  if (options.deletedTurn !== undefined) {
    entries.push({ at: now, by: options.by, action: 'delete', ...options.deletedTurn })
  }

  return entries
}

async function assertOpenGame(gameId: GameId, intent: TurnWriteIntent): Promise<void> {
  const stored = (await getDoc(doc(getDb(), 'games', gameId))).data()
  const game = stored as unknown as GameStatusData | undefined

  if (game === undefined) {
    throw new DataError('notFound')
  }

  if (game.status === 'finalized') {
    throw new DataError('finalizedGame')
  }

  /**
   * RF-18.18: marcada porque alguien quedó por debajo de cero, la partida solo admite finalizarse
   * (RF-0.4 y RF-10.6 de `specs/001`). Corregir está vetado.
   *
   * La **única** excepción es borrar su último turno, que es la operación que puede levantar la
   * marca —caso límite 18 y RF-18.19—, así que con el veto entero no habría camino para levantarla
   * nunca. Que el borrado sea de verdad el último lo comprueba `remove`, que es quien lee los
   * turnos; que la partida quede o no sin nadie por debajo de cero lo decide `domain/replay.ts`, y
   * quien escribe el resultado es `useGameTurns`. Aquí no se decide nada de eso: `data/` no calcula
   * reglas de negocio (constitution V.1).
   */
  if (game.mustFinalize && intent !== 'deleteLast') {
    throw new DataError('gameMarked')
  }

  if (game.status !== 'open') {
    throw new DataError('notOpen')
  }
}

/** Cuántos turnos hay y cuál es el mayor: lo que decide si un borrado es «el último». */
async function isLastTurn(gameId: GameId, turnNo: number): Promise<boolean> {
  const snap = await getDocs(
    query(collection(getDb(), 'games', gameId, 'turns'), orderBy('turnNo', 'asc')),
  )
  const last = snap.docs.reduce((max, snapshot) => Math.max(max, turnNoOf(snapshot)), 0)

  return last === turnNo
}

async function assertExists(gameId: GameId): Promise<void> {
  const stored = (await getDoc(doc(getDb(), 'games', gameId))).data()

  if (stored === undefined) {
    throw new DataError('notFound')
  }
}

async function assertSequentialTurn(gameId: GameId, turnNo: number): Promise<void> {
  const snap = await getDocs(
    query(collection(getDb(), 'games', gameId, 'turns'), orderBy('turnNo', 'asc')),
  )
  let max = 0

  for (const snapshot of snap.docs) {
    const existing = turnNoOf(snapshot)

    if (existing === turnNo) {
      throw new DataError('duplicateNumber')
    }

    max = Math.max(max, existing)
  }

  if (turnNo !== max + 1) {
    throw new DataError('gapInSequence')
  }
}

/**
 * RF-20.1: el identificador es el número del turno en decimal y **sin relleno de ceros**. El
 * relleno a dos dígitos era lo que hacía que el orden lexicográfico dejara de ser el cronológico a
 * partir del turno 100, y por eso el orden lo fija `orderBy('turnNo')`, nunca el identificador.
 */
function turnDocId(turnNo: number): string {
  return String(turnNo)
}
