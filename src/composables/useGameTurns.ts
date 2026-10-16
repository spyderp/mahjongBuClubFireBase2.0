import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { nowTimestamp, replayOutcomeOf, rewriteSeasonDocs } from '@/composables/useGames'
import type { ReplayOutcome } from '@/composables/useGames'
import { createBatch } from '@/data/batch'
import { DataError } from '@/data/errors'
import { gamesRepository } from '@/data/games.repository'
import type { GameRecord, TurnDeleteEntry } from '@/data/games.repository'
import { capturedTurnOf, toTurnSnapshot, turnsRepository } from '@/data/turns.repository'
import type {
  CreateTurnInput,
  TurnRecord,
  UpdateTurnPatch,
  UpdateTurnPatchField,
} from '@/data/turns.repository'
import { replayTurns } from '@/domain/replay'
import type { ReplayedTurn } from '@/domain/replay'
import type { HandState } from '@/domain/rules'
import type { GameId } from '@/domain/types'
import { gameDetailQuery } from '@/queries/games'
import { turnsKeys, turnsListQuery } from '@/queries/turns'

const DRAFT_PREFIX = 'mahjongbu.turn-draft.'

/** Borrador del turno en curso (RF-15.8): forma libre del formulario, no un modelo. */
export type TurnDraft = Readonly<Record<string, unknown>>

/**
 * Qué espera quien corrige haber leído. RF-19.15: si el servidor tiene más turnos o más
 * correcciones de las que se leyeron, re-derivar sería calcular sobre un estado que no es el de
 * esta partida, y el resultado sería incorrecto **y en silencio**. Por eso el rechazo es explícito
 * y la operación no escribe nada.
 */
export type CorrectTurnVars = {
  readonly turnNo: number
  readonly patch: UpdateTurnPatch
  readonly by: string
  readonly expectedTurnCount: number
  readonly expectedAuditCount: number
}

export type DeleteTurnVars = {
  readonly turnNo: number
  readonly by: string
  readonly expectedTurnCount: number
}

/**
 * Los campos que recalcula el sistema y que por tanto se marcan como derivados en el registro
 * (RF-19.5): lo que escribió una persona y lo que salió de `domain/replay.ts` tienen que poder
 * distinguirse leyendo el `audit[]` del turno.
 */
const DERIVED_FIELDS = [
  'wind',
  'dealerId',
  'honba',
  'riichiSticks',
  'value',
  'deltas',
] as const satisfies readonly UpdateTurnPatchField[]

/**
 * T68 · RF-3.1 a RF-3.14, RF-4.x, RF-9.6, RF-15.7, RF-15.8, RF-18.7 a RF-18.19 y RF-19.1 a RF-19.16:
 * registro y corrección de turnos de una partida más el borrador en `localStorage`. Registrar o
 * corregir invalida la lista de turnos, el listado de abiertas (por `updatedAt`) y el detalle de la
 * partida.
 *
 * Corregir y borrar ya no son una edición: invocan `replayTurns` y escriben el turno corregido,
 * los re-derivados y los derivados de la temporada en un **único** `WriteBatch` (RF-18.14), de
 * modo que un fallo no deje la partida a medio recalcular.
 */
export function useGameTurns(gameId: MaybeRefOrGetter<GameId>) {
  const game = computed(() => toValue(gameId))
  const query = useQuery(() => turnsListQuery(game.value))
  const owner = useQuery(() => gameDetailQuery(game.value))
  const queryCache = useQueryCache()

  /**
   * RF-18.1 y RF-23.3: el estado de la mano que se capturará a continuación. Viene de
   * `domain/replay.ts` y no de un desplegable, y es `null` cuando la partida no se puede reproducir
   * —porque entonces cualquier estado que se pintara sería inventado—. La partida se lee con la
   * misma query que usa la pantalla de detalle, así que no hay una segunda petición.
   */
  const nextHand = computed<HandState | null>(() => {
    const gameState = owner.state.value
    const turnState = query.state.value

    if (gameState.status !== 'success' || turnState.status !== 'success') {
      return null
    }

    const record = gameState.data
    const turns = turnState.data

    if (record === null || record === undefined || turns === undefined) {
      return null
    }

    const replayed = replayTurns(
      record.players.map((player) => ({
        playerId: player.playerId,
        seat: player.seat,
        score: record.startPoints,
      })),
      turns.map((turn) => capturedTurnOf(turn)),
      1,
    )

    return replayed.ok ? replayed.outcome.nextHand : null
  })

  const registerTurn = useMutation({
    mutation: (input: CreateTurnInput): Promise<TurnRecord> =>
      turnsRepository.create(game.value, input),
    onSettled: () => {
      invalidateTurnCaches(queryCache, game.value)
    },
  })

  const correctTurn = useMutation({
    mutation: async (vars: CorrectTurnVars): Promise<TurnRecord> => {
      const owner = await requireGame(game.value)
      const stored = await turnsRepository.list(game.value)
      assertFresh(stored, vars.turnNo, vars.expectedTurnCount, vars.expectedAuditCount)

      /**
       * Lo que se re-deriva es la partida **ya corregida** (RF-18.7): el recorrido recibe el turno
       * con el parche ya aplicado, porque cambiar lo que pasó en el turno N cambia lo que los
       * siguientes resolvieron.
       */
      const replayed = replayFrom(owner, stored, vars.turnNo, vars.patch)

      /**
       * El turno corregido es uno más de los re-derivan: `replayTurns` lo devuelve porque empieza
       * en `turnNo`. Sus valores derivados vienen del recorrido y ganan a los del parche —RF-18.8
       * los recalcula el sistema—, y los que escribió una persona se conservan tal cual (RF-18.13).
       */
      const batch = createBatch()
      const own = replayed.turns[0]

      if (own === undefined) {
        throw new DataError('notFound')
      }

      const corrected = await turnsRepository.update(
        game.value,
        vars.turnNo,
        { ...vars.patch, ...derivedPatch(own) },
        {
          batch,
          by: vars.by,
          expectedAuditCount: vars.expectedAuditCount,
          derived: DERIVED_FIELDS,
        },
      )

      const rederived = await writeReplayed(
        game.value,
        batch,
        stored,
        replayed.turns.slice(1),
        vars.by,
      )

      await rewriteSeasonDerived(batch, owner, replacing(stored, [corrected, ...rederived]))
      await syncBankruptFlag(batch, owner, replayed.mustFinalize)

      await batch.commit()

      return corrected
    },
    onSettled: () => {
      invalidateTurnCaches(queryCache, game.value)
    },
  })

  const deleteTurn = useMutation({
    mutation: async (vars: DeleteTurnVars): Promise<readonly TurnRecord[]> => {
      const owner = await requireGame(game.value)
      const stored = await turnsRepository.list(game.value)

      if (stored.length !== vars.expectedTurnCount) {
        throw new DataError('staleLocal')
      }

      const deleted = stored.find((turn) => turn.turnNo === vars.turnNo)

      if (deleted === undefined) {
        throw new DataError('notFound')
      }

      /**
       * RF-18.9: el estado que queda **después** del borrado es el de una partida en la que ese
       * turno nunca se capturó, así que se recorre la lista sin él. El recorrido devuelve los
       * supervivientes con su número viejo, y de ahí sale la renumeración.
       */
      const kept = stored.filter((turn) => turn.turnNo !== vars.turnNo)
      const replayed = replayFrom(owner, kept, 1)
      const batch = createBatch()

      /**
       * El borrado va primero en el lote: su `delete` sobre el identificador liberado tiene que
       * ocurrir **antes** de que el turno siguiente se escriba ahí, o la partida acabaría sin ese
       * número. A partir de ahí los movimientos van de menor a mayor, porque cada uno escribe el
       * identificador que el siguiente va a borrar.
       *
       * La excepción al veto de bancarrota solo se pide si la partida está marcada **y** el turno
       * borrado es el último: es la única operación que puede levantar la marca (caso límite 18 y
       * RF-18.19). Si el borrado no la levanta, `syncBankruptFlag` la deja como estaba y la partida
       * sigue sin más camino que finalizarse.
       */
      await turnsRepository.remove(game.value, vars.turnNo, batch, {
        waivesBankruptcy: owner.mustFinalize && vars.turnNo === lastTurnNo(stored),
      })
      await recordDeletion(game.value, batch, owner, stored, deleted, vars.by)
      const moved = await renumber(game.value, batch, stored, replayed, vars.turnNo, vars.by)

      /**
       * Los turnos anteriores al borrado no cambian de valor —borrar un turno posterior no altera
       * el estado en que estaban— y por eso no se reescriben ni reciben entrada de registro.
       */
      const survivors: readonly TurnRecord[] = [
        ...kept.filter((turn) => turn.turnNo < vars.turnNo),
        ...moved,
      ]

      await rewriteSeasonDerived(batch, owner, survivors)
      await syncBankruptFlag(batch, owner, replayed.mustFinalize)

      await batch.commit()

      return survivors
    },
    onSettled: () => {
      invalidateTurnCaches(queryCache, game.value)
    },
  })

  return {
    state: query.state,
    data: query.data,
    nextHand,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
    refetch: query.refetch,
    registerTurn,
    correctTurn,
    deleteTurn,
    nextNumber: (): Promise<number> => turnsRepository.nextNumber(game.value),
    saveDraft: (draft: TurnDraft): boolean => saveTurnDraft(game.value, draft),
    loadDraft: (): TurnDraft | null => loadTurnDraft(game.value),
    clearDraft: (): void => clearTurnDraft(game.value),
  }
}

/** RF-15.8: guarda el borrador del turno en curso bajo la clave del juego. */
export function saveTurnDraft(gameId: GameId, draft: TurnDraft): boolean {
  try {
    localStorage.setItem(draftKey(gameId), JSON.stringify(draft))

    return true
  } catch {
    return false
  }
}

/** RF-15.8: recupera el borrador; si no existe o no es un objeto, devuelve `null`. */
export function loadTurnDraft(gameId: GameId): TurnDraft | null {
  const raw = localStorage.getItem(draftKey(gameId))

  if (raw === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** RF-15.8: descarta el borrador al confirmar o al abandonar la captura. */
export function clearTurnDraft(gameId: GameId): void {
  localStorage.removeItem(draftKey(gameId))
}

function draftKey(gameId: GameId): string {
  return `${DRAFT_PREFIX}${gameId}`
}

function invalidateTurnCaches(queryCache: ReturnType<typeof useQueryCache>, gameId: GameId): void {
  void queryCache.invalidateQueries({ key: turnsKeys.list(gameId) })
  void queryCache.invalidateQueries({ key: ['games', 'open'] })
  void queryCache.invalidateQueries({ key: ['games', 'detail', gameId] })
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function requireGame(gameId: GameId): Promise<GameRecord> {
  const owner = await gamesRepository.getById(gameId)

  if (owner === null) {
    throw new DataError('notFound')
  }

  return owner
}

/**
 * RF-19.15: el estado local tiene que coincidir con el que se leyó. Se comprueba **antes** de
 * abrir el lote, así que un rechazo ni siquiera llega a encolar nada.
 */
function assertFresh(
  stored: readonly TurnRecord[],
  turnNo: number,
  expectedTurnCount: number,
  expectedAuditCount: number,
): void {
  if (stored.length !== expectedTurnCount) {
    throw new DataError('staleLocal')
  }

  const current = stored.find((turn) => turn.turnNo === turnNo)

  if (current === undefined) {
    throw new DataError('notFound')
  }

  if (current.audit.length !== expectedAuditCount) {
    throw new DataError('staleLocal')
  }
}

/**
 * El recorrido de la partida. `patch` se aplica solo al turno que se está corrigiendo, porque lo que
 * se re-deriva es la partida **ya corregida** (RF-18.7): cambiar lo que pasó en el turno N cambia lo
 * que los siguientes resolvieron. Comparte `replayOutcomeOf` con `useGames`, que lanza el mismo
 * `replayInvalid`: una partida que no se puede reproducir no se puede ni corregir ni finalizar.
 */
function replayFrom(
  game: GameRecord,
  stored: readonly TurnRecord[],
  desdeTurno: number,
  patch?: UpdateTurnPatch,
): ReplayOutcome {
  return replayOutcomeOf(game, stored, desdeTurno, patch)
}

/** El parche que escribe un turno re-derivado: exactamente los campos que recalculó el sistema. */
function derivedPatch(turn: ReplayedTurn): UpdateTurnPatch {
  return {
    wind: turn.wind,
    dealerId: turn.dealerId,
    honba: turn.honba,
    riichiSticks: turn.riichiSticks,
    value: turn.values,
    deltas: turn.deltas,
  }
}

type Batch = ReturnType<typeof createBatch>

/**
 * RF-19.4: cada turno posterior que una corrección re-deriva recibe **su propia** entrada de
 * registro, con quién, cuándo y qué campos cambiaron. El número de correcciones que se exige es el
 * de esta misma lectura, así que un cambio ajeno entre medias se rechaza como en el turno corregido.
 */
async function writeReplayed(
  gameId: GameId,
  batch: Batch,
  stored: readonly TurnRecord[],
  replayed: readonly ReplayedTurn[],
  by: string,
): Promise<readonly TurnRecord[]> {
  const written: TurnRecord[] = []

  for (const derived of replayed) {
    const previous = stored.find((turn) => turn.turnNo === derived.turnNo)

    if (previous === undefined) {
      throw new DataError('notFound')
    }

    written.push(
      await turnsRepository.update(gameId, derived.turnNo, derivedPatch(derived), {
        batch,
        by,
        expectedAuditCount: previous.audit.length,
        derived: DERIVED_FIELDS,
      }),
    )
  }

  return written
}

/**
 * RF-18.9: renumera. El turno `N+1` pasa a ocupar el hueco de `N`, el `N+2` al del `N+1`, y así
 * hasta el final.
 *
 * El orden es **ascendente** y no descendente, y no es un detalle: cada movimiento escribe el
 * identificador que el siguiente va a borrar, así que el `delete` del identificador `k` —que hace
 * el movimiento desde `k`— tiene que encolarse antes que el `set` del mismo `k`, que hace el
 * movimiento desde `k+1`. En descendente el turno final se quedaba sin escribir.
 *
 * Las lecturas no dependen del orden: todas se hacen contra el estado confirmado, no contra el
 * lote, así que el turno que se lee sigue ahí aunque su identificador se haya liberado antes.
 */
async function renumber(
  gameId: GameId,
  batch: Batch,
  stored: readonly TurnRecord[],
  replayed: ReplayOutcome,
  deletedTurnNo: number,
  by: string,
): Promise<readonly TurnRecord[]> {
  const moved: TurnRecord[] = []
  const pending = replayed.turns
    .filter((turn) => turn.turnNo > deletedTurnNo)
    .sort((a, b) => a.turnNo - b.turnNo)

  for (const derived of pending) {
    const source = stored.find((turn) => turn.turnNo === derived.turnNo)

    if (source === undefined) {
      throw new DataError('notFound')
    }

    moved.push(
      await turnsRepository.update(gameId, derived.turnNo, derivedPatch(derived), {
        batch,
        by,
        expectedAuditCount: source.audit.length,
        derived: DERIVED_FIELDS,
        moveToTurnNo: derived.turnNo - 1,
      }),
    )
  }

  return moved
}

/**
 * RF-19.6 y RF-19.7: el registro del borrado va en el turno inmediatamente anterior, porque en el
 * borrado se llevaría por delante su propio registro. Si no hay anterior, va en la partida, que es
 * el único sitio donde puede sobrevivir.
 */
async function recordDeletion(
  gameId: GameId,
  batch: Batch,
  owner: GameRecord,
  stored: readonly TurnRecord[],
  deleted: TurnRecord,
  by: string,
): Promise<void> {
  const previous = stored.filter((turn) => turn.turnNo < deleted.turnNo).at(-1)

  if (previous !== undefined) {
    await turnsRepository.update(
      gameId,
      previous.turnNo,
      { honba: previous.honba },
      {
        batch,
        by,
        expectedAuditCount: previous.audit.length,
        deletedTurn: { turnNo: deleted.turnNo, before: toTurnSnapshot(deleted) },
      },
    )

    return
  }

  const entry: TurnDeleteEntry = {
    at: nowTimestamp(),
    by,
    action: 'delete',
    turnNo: deleted.turnNo,
    before: toTurnSnapshot(deleted),
  }

  await gamesRepository.update(gameId, { turnAudit: [...owner.turnAudit, entry] }, batch)
}

/** La lista de turnos tal y como queda tras escribir estos, para el recálculo de la temporada. */
function replacing(stored: readonly TurnRecord[], changed: readonly TurnRecord[]): TurnRecord[] {
  const overrides = new Map(changed.map((turn) => [turn.turnNo, turn]))

  return stored.map((turn) => overrides.get(turn.turnNo) ?? turn)
}

/** El último número de turno de la partida: `list` viene ordenado por `turnNo` y no deja huecos. */
function lastTurnNo(stored: readonly TurnRecord[]): number {
  return stored[stored.length - 1]?.turnNo ?? 0
}

/**
 * RF-9.6 y RF-18.12: corregir o borrar un turno vuelve a calcular marcador, estadísticas y ranking.
 * Sin `seasonId` no hay derivados que reescribir.
 */
async function rewriteSeasonDerived(
  batch: Batch,
  owner: GameRecord,
  turns: readonly TurnRecord[],
): Promise<void> {
  if (owner.seasonId === null) {
    return
  }

  await rewriteSeasonDocs(owner.seasonId, owner.id, owner.status, owner.results, turns, batch)
}

/**
 * RF-18.11 y RF-18.19: el cierre por bancarrota se recalcula en la misma operación y solo se
 * escribe cuando cambia, porque tocar la partida sin necesidad le cambiaría `updatedAt` y con él la
 * regla de los 7 días de RF-10.4.
 */
async function syncBankruptFlag(
  batch: Batch,
  owner: GameRecord,
  mustFinalize: boolean,
): Promise<void> {
  if (owner.mustFinalize === mustFinalize) {
    return
  }

  await gamesRepository.update(owner.id, { mustFinalize }, batch)
}
