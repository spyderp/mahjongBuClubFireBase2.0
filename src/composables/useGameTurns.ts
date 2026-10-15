import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { rewriteSeasonDocs } from '@/composables/useGames'
import { createBatch } from '@/data/batch'
import { gamesRepository } from '@/data/games.repository'
import { turnsRepository } from '@/data/turns.repository'
import type { CreateTurnInput, TurnRecord, UpdateTurnPatch } from '@/data/turns.repository'
import type { GameId } from '@/domain/types'
import { turnsKeys, turnsListQuery } from '@/queries/turns'

const DRAFT_PREFIX = 'mahjongbu.turn-draft.'

/** Borrador del turno en curso (RF-15.8): forma libre del formulario, no un modelo. */
export type TurnDraft = Readonly<Record<string, unknown>>

/**
 * T68 · RF-3.1 a RF-3.14, RF-4.x, RF-9.6, RF-15.7 y RF-15.8: registro y corrección de turnos de
 * una partida más el borrador en `localStorage`. Registrar o corregir invalida la lista de turnos,
 * el listado de abiertas (por `updatedAt`) y el detalle de la partida; corregir además reescribe
 * los derivados de la temporada en el mismo `WriteBatch` (RF-9.6).
 */
export function useGameTurns(gameId: MaybeRefOrGetter<GameId>) {
  const game = computed(() => toValue(gameId))
  const query = useQuery(() => turnsListQuery(game.value))
  const queryCache = useQueryCache()

  const registerTurn = useMutation({
    mutation: (input: CreateTurnInput): Promise<TurnRecord> =>
      turnsRepository.create(game.value, input),
    onSettled: () => {
      invalidateTurnCaches(queryCache, game.value)
    },
  })

  const correctTurn = useMutation({
    mutation: async (vars: {
      readonly turnNo: number
      readonly patch: UpdateTurnPatch
    }): Promise<TurnRecord> => {
      const batch = createBatch()
      const corrected = await turnsRepository.update(game.value, vars.turnNo, vars.patch, batch)

      /**
       * RF-9.6: corregir un turno vuelve a calcular marcador, estadísticas y ranking. El turno ya
       * corregido se le pasa al recálculo a mano porque `batch` aún no está confirmado y `list`
       * leería la versión anterior. Sin `seasonId` no hay derivados que reescribir.
       */
      const owner = await gamesRepository.getById(game.value)
      if (owner !== null && owner.seasonId !== null) {
        const stored = await turnsRepository.list(game.value)
        const turns = stored.map((turn) => (turn.turnNo === corrected.turnNo ? corrected : turn))

        await rewriteSeasonDocs(owner.seasonId, owner.id, owner.status, owner.results, turns, batch)
      }

      await batch.commit()

      return corrected
    },
    onSettled: () => {
      invalidateTurnCaches(queryCache, game.value)
    },
  })

  return {
    state: query.state,
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refresh,
    refetch: query.refetch,
    registerTurn,
    correctTurn,
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
