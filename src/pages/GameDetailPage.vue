<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TurnForm from '@/components/turns/TurnForm.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import { useGames, useGameDetail } from '@/composables/useGames'
import { useGameTurns } from '@/composables/useGameTurns'
import { usePlayers } from '@/composables/usePlayers'
import { toGameId } from '@/domain/types'
import type { PlayerId, Position, Seat, Timestamp } from '@/domain/types'
import { offersAbandon } from '@/domain/game'
import type { GameRecord } from '@/data/games.repository'
import { DataError } from '@/data/errors'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ gameId: string }>()

const { t, d, n } = useI18n()
const session = useSessionStore()
const gameId = computed(() => toGameId(props.gameId))
const { state: gameState, refresh: refreshGame } = useGameDetail(gameId)
const { data: turns, nextHand, deleteTurn } = useGameTurns(gameId)
const { data: players } = usePlayers()

/**
 * Constitution VI.2: `data` de la consulta de detalle es `GameRecord | null | undefined`, así
 * que se estrecha desde `state.status` y se colapsa el «no existe» a `undefined`. El template
 * ya distingue `v-if="game === undefined"`.
 */
const game = computed<GameRecord | undefined>(() => {
  const state = gameState.value

  if (state === undefined || state.status !== 'success') {
    return undefined
  }

  return state.data ?? undefined
})

const { finalizeGame, unfinalizeGame, abandonGame } = useGames()

const finalizeDialog = ref(false)
const unfinalizeDialog = ref(false)
const abandonDialog = ref(false)
const deleteTurnDialog = ref(false)
const deleteTurnNo = ref<number | null>(null)
const deleteTurnError = ref<string | null>(null)

const by = computed(() => session.user?.id ?? '')

const names = computed<ReadonlyMap<PlayerId, string>>(() => {
  const map = new Map<PlayerId, string>()
  for (const player of players.value ?? []) {
    map.set(player.id, player.name)
  }

  return map
})

function nameOf(playerId: PlayerId): string {
  return names.value.get(playerId) ?? playerId
}

function seatOf(playerId: PlayerId): Seat | undefined {
  return game.value?.players.find((player) => player.playerId === playerId)?.seat
}

function seatLabel(playerId: PlayerId): string {
  const seat = seatOf(playerId)

  return seat === undefined ? playerId : t(`gamesView.seats.${seat}`)
}

/**
 * RF-19.10: la marca de tiempo del registro, con el formato del locale (nunca `toLocaleString`).
 * El `Timestamp` de Firestore no es un `Date`, así que se traduce antes de formatearlo.
 */
function atOf(value: Timestamp): string {
  return d(new Date(value.seconds * 1000), 'short')
}

/** El nombre de un campo del registro, para no repetir el mapa de tipos en el template. */
const AUDIT_FIELDS: Readonly<Record<string, string>> = {
  wind: 'turnForm.roundWind',
  dealerId: 'turnForm.dealerSeat',
  honba: 'turnForm.honba',
  resultType: 'turnForm.resultType',
  yaku: 'turnForm.yaku',
  yakuHan: 'turnForm.yakuHan',
  yakuHanOverride: 'turnForm.yakuHanOverride',
  doraCount: 'turnForm.dora',
  fu: 'turnForm.fu',
  tenpai: 'turnForm.tenpai',
  riichiDeclaredBy: 'turnForm.riichi',
  riichiSticks: 'turnForm.riichi',
  value: 'handValue.totalPoints',
  deltas: 'gamesView.finalScore',
  discarderId: 'turnForm.discarder',
  chomboId: 'turnForm.resultTypes.chombo',
  isRenchan: 'turnForm.nextHand.honba',
  isFinalTurn: 'turnForm.nextHand.title',
}

function fieldLabel(field: string): string {
  return t(AUDIT_FIELDS[field] ?? 'turnForm.yaku')
}

function windBadgeClass(seat: Seat): string {
  switch (seat) {
    case 'east':
      return 'bg-mahjong-wind-east'
    case 'south':
      return 'bg-mahjong-wind-south'
    case 'west':
      return 'bg-mahjong-wind-west'
    case 'north':
      return 'bg-mahjong-wind-north'
    default:
      return 'bg-mahjong-border'
  }
}

const standby = computed(() => {
  if (turns.value === undefined || game.value === undefined) {
    return []
  }

  const byPlayer = new Map<PlayerId, number>()
  for (const turn of turns.value) {
    for (const delta of turn.deltas) {
      byPlayer.set(delta.playerId, (byPlayer.get(delta.playerId) ?? 0) + delta.delta)
    }
  }

  const current = game.value

  return current.players.map((participant) => ({
    playerId: participant.playerId,
    seat: participant.seat,
    score: current.startPoints + (byPlayer.get(participant.playerId) ?? 0),
  }))
})

type Standing = {
  readonly playerId: PlayerId
  readonly seat: Seat
  readonly score: number
  readonly position: Position | null
}

/** RF-8.1: marcador en pie hasta finalizar; con la partida finalizada, posición y uma. */
const standings = computed<readonly Standing[]>(() => {
  const current = game.value
  if (current?.status === 'finalized') {
    return current.results.map((result) => ({
      playerId: result.playerId,
      seat: result.seat,
      score: result.finalScore,
      position: result.finalPosition,
    }))
  }

  return standby.value.map((entry) => ({ ...entry, position: null }))
})

const riichiSticks = computed(() => turns.value?.at(-1)?.riichiSticks ?? 0)

/** Estado de la mesa para el último turno capturado (o estado actual si no hay turnos). */
const mesa = computed(() => {
  const current = game.value
  const lastTurn = turns.value?.at(-1)

  if (!current) {
    return []
  }

  const baseScores = new Map<PlayerId, number>()
  for (const participant of current.players) {
    baseScores.set(participant.playerId, current.startPoints)
  }

  if (turns.value && turns.value.length > 0) {
    for (const turn of turns.value) {
      for (const delta of turn.deltas) {
        baseScores.set(delta.playerId, (baseScores.get(delta.playerId) ?? current.startPoints) + delta.delta)
      }
    }
  }

  const lastResultType = lastTurn?.resultType
  const winnerIds = lastTurn?.deltas.filter(d => d.delta > 0).map(d => d.playerId) ?? []
  const ronLoserId = lastResultType === 'ron' ? lastTurn?.discarderId : undefined

  return current.players.map((participant) => {
    const playerId = participant.playerId
    const score = baseScores.get(playerId) ?? current.startPoints
    const delta = lastTurn?.deltas.find(d => d.playerId === playerId)?.delta ?? 0
    const isDealer = participant.seat === (lastTurn?.dealerId ?? nextHand.value?.dealer)
    const hasRiichi = lastTurn?.riichiDeclaredBy?.includes(playerId) ?? false

    return {
      playerId,
      name: nameOf(playerId),
      seat: participant.seat,
      score,
      delta,
      deltaClass: delta > 0 ? 'text-mahjong-positive' : delta < 0 ? 'text-mahjong-negative' : 'text-mahjong-muted',
      deltaText: delta > 0 ? `+${delta}` : String(delta),
      isWinner: winnerIds.includes(playerId),
      isRonLoser: ronLoserId === playerId,
      isDealer,
      hasRiichi,
    }
  })
})

/** El dealer de la mano siguiente: el jugador que ocupa el asiento que el recorrido devuelve. */
const dealerId = computed<PlayerId | ''>(() => {
  const seat = nextHand.value?.dealer

  if (seat === undefined) {
    return ''
  }

  return game.value?.players.find((player) => player.seat === seat)?.playerId ?? ''
})

const canCapture = computed(
  () =>
    game.value !== undefined &&
    session.status === 'authenticated' &&
    game.value.status === 'open' &&
    !game.value.mustFinalize &&
    game.value.ruleset === 'mahjongSouls',
)

/**
 * T13 · RF-26.1. El jugador sobre el que se ha hecho clic en el marcador. Mientras hay uno elegido,
 * se pinta su diferencia contra cada rival en la fila de ese rival; al volver a pulsarlo se quita.
 */
const selectedPlayerId = ref<PlayerId | null>(null)

function selectPlayer(playerId: PlayerId): void {
  selectedPlayerId.value = selectedPlayerId.value === playerId ? null : playerId
}

/** El marcador en pie de un jugador, o `undefined` si no juega esta partida. */
function scoreOf(playerId: PlayerId): number | undefined {
  return standings.value.find((entry) => entry.playerId === playerId)?.score
}

/**
 * RF-26.1 y RF-26.2: la diferencia del jugador elegido contra el rival de una fila es su marcador
 * menos el del rival. Con marcadores iguales es **cero** —nunca `null`—, así que la celda nunca
 * queda vacía; si alguno de los dos no está en el marcador, también es cero.
 */
function differenceAgainst(rivalId: PlayerId): number {
  const selected = selectedPlayerId.value

  if (selected === null) {
    return 0
  }

  const mine = scoreOf(selected)
  const theirs = scoreOf(rivalId)

  if (mine === undefined || theirs === undefined) {
    return 0
  }

  return mine - theirs
}

/** La diferencia con su signo, como el marcador: `+23200`, `-5200`, `0`. */
function differenceTextOf(rivalId: PlayerId): string {
  const difference = differenceAgainst(rivalId)

  return difference > 0 ? `+${difference}` : String(difference)
}

async function confirmFinalize(): Promise<void> {
  if (game.value === undefined) {
    return
  }

  await finalizeGame.mutateAsync({ gameId: game.value.id, by: by.value })
  await refreshGame()
  finalizeDialog.value = false
}

async function confirmUnfinalize(): Promise<void> {
  if (game.value === undefined) {
    return
  }

  await unfinalizeGame.mutateAsync({ gameId: game.value.id, by: by.value })
  await refreshGame()
  unfinalizeDialog.value = false
}

async function confirmAbandon(): Promise<void> {
  if (game.value === undefined) {
    return
  }

  await abandonGame.mutateAsync(game.value.id)
  await refreshGame()
  abandonDialog.value = false
}

async function confirmDeleteTurn(): Promise<void> {
  if (game.value === undefined || deleteTurnNo.value === null) {
    return
  }

  deleteTurnError.value = null

  try {
    const turnCount = turns.value?.length ?? 0
    await deleteTurn.mutateAsync({ turnNo: deleteTurnNo.value, by: by.value, expectedTurnCount: turnCount })
    await refreshGame()
    deleteTurnDialog.value = false
    deleteTurnNo.value = null
  } catch (error) {
    if (error instanceof DataError && error.code === 'staleLocal') {
      deleteTurnError.value = t('gamesView.deleteTurnStale')
    } else {
      deleteTurnError.value = error instanceof Error ? error.message : 'Error desconocido'
    }
  }
}

function now(): { seconds: number; nanoseconds: number } {
  const milliseconds = Date.now()

  return {
    seconds: Math.floor(milliseconds / 1000),
    nanoseconds: (milliseconds % 1000) * 1_000_000,
  }
}
</script>

<template>
  <section>
    <template v-if="game === undefined">
      <p class="text-mahjong-muted">
        {{ t('common.loading') }}
      </p>
    </template>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold">
          {{ t('gamesView.game') }} {{ game.players.map((p) => nameOf(p.playerId)).join(' vs ') }}
        </h1>

        <div class="flex flex-wrap items-center gap-2">
          <span
            :class="{
              'rounded-full px-3 py-1 text-sm': true,
              'bg-mahjong-accent/10 text-mahjong-accent': game.status === 'open',
              'bg-amber-100 text-amber-800': game.status === 'finalized',
              'bg-mahjong-border/40 text-mahjong-muted': game.status === 'aborted',
            }"
          >
            {{ t(`gamesView.statuses.${game.status}`) }}
          </span>
          <span
            v-if="game.mustFinalize"
            class="rounded-full bg-red-100 px-3 py-1 text-sm text-red-800"
          >
            {{ t('gamesView.bancarrota') }}
          </span>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <!-- Columna 1: Marcador, Fichas de riichi, Estado mano siguiente, Mesa -->
        <div class="space-y-4">
          <div>
            <h2 class="mb-2 text-lg font-semibold">
              {{ t('gamesView.stands') }}
            </h2>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-mahjong-border text-mahjong-muted">
                  <th class="px-2 py-1 text-start font-medium">{{ t('gamesView.player') }}</th>
                  <th class="px-2 py-1 text-start font-medium">{{ t('gamesView.seat') }}</th>
                  <th class="px-2 py-1 text-end font-medium">{{ t('gamesView.finalScore') }}</th>
                  <th v-if="selectedPlayerId !== null" class="px-2 py-1 text-end font-medium">
                    {{ t('gamesView.difference') }}
                  </th>
                  <th v-if="game.status === 'finalized'" class="px-2 py-1 text-end font-medium">
                    {{ t('gamesView.position') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in standings"
                  :key="entry.playerId"
                  class="cursor-pointer border-b border-mahjong-border last:border-b-0"
                  :data-test="`standing-${entry.playerId}`"
                  @click="selectPlayer(entry.playerId)"
                >
                  <td class="px-2 py-1">{{ nameOf(entry.playerId) }}</td>
                  <td class="px-2 py-1">{{ t(`gamesView.seats.${entry.seat}`) }}</td>
                  <td class="px-2 py-1 text-end">{{ entry.score }}</td>
                  <td
                    v-if="selectedPlayerId !== null && entry.playerId !== selectedPlayerId"
                    class="px-2 py-1 text-end"
                    data-test="player-difference"
                  >
                    {{ differenceTextOf(entry.playerId) }}
                  </td>
                  <td
                    v-else-if="selectedPlayerId !== null && entry.playerId === selectedPlayerId"
                    class="px-2 py-1 text-end"
                    data-test="player-difference"
                  >
                    0
                  </td>
                  <td v-if="entry.position !== null" class="px-2 py-1 text-end">
                    {{ t(`uma.${entry.position}`) }}
                  </td>
                </tr>
              </tbody>
            </table>

            <p class="mt-3 text-sm text-mahjong-muted">
              {{ t('gamesView.riichiPot') }}: {{ riichiSticks }}
            </p>

            <fieldset
              v-if="nextHand !== null"
              class="mt-3 flex flex-col gap-1 rounded border border-mahjong-border px-3 py-2 text-sm"
              data-test="next-hand"
            >
              <legend class="px-1 text-mahjong-muted">
                {{ t('turnForm.nextHand.title') }}
              </legend>
              <span class="flex justify-between">
                <span class="text-mahjong-muted">{{ t('turnForm.nextHand.roundWind') }}</span>
                <span data-test="next-wind">{{ t(`gamesView.seats.${nextHand.wind}`) }}</span>
              </span>
              <span class="flex justify-between">
                <span class="text-mahjong-muted">{{ t('turnForm.nextHand.dealerSeat') }}</span>
                <span data-test="next-dealer">
                  {{ dealerId === '' ? '' : seatLabel(dealerId) }}
                </span>
              </span>
              <span class="flex justify-between">
                <span class="text-mahjong-muted">{{ t('turnForm.nextHand.honba') }}</span>
                <span data-test="next-honba">{{ nextHand.honba }}</span>
              </span>
            </fieldset>

            <!-- Mesa -->
            <fieldset
              v-if="mesa.length > 0"
              class="mt-3 rounded border border-mahjong-border bg-mahjong-surface p-3"
              data-test="mesa"
            >
              <legend class="px-1 text-mahjong-muted text-sm font-medium">
                {{ t('turnForm.mesa.title') }}
              </legend>
              <div class="grid grid-cols-2 gap-3">
                <div
                  v-for="row in mesa"
                  :key="row.playerId"
                  class="relative rounded border border-mahjong-border bg-mahjong-bg p-3 transition-colors"
                  :data-test="`mesa-${row.seat}`"
                  :class="{
                    'ring-2 ring-mahjong-positive': row.isWinner,
                    'ring-2 ring-mahjong-negative': row.isRonLoser,
                  }"
                >
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-full bg-mahjong-border flex items-center justify-center text-xs text-mahjong-muted">
                        {{ row.name.charAt(0) }}
                      </div>
                      <span class="font-medium text-sm" data-test="mesa-name">{{ row.name }}</span>
                    </div>
                    <span
                      class="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                      :class="windBadgeClass(row.seat)"
                      data-test="mesa-wind-badge"
                    >
                      {{ t(`gamesView.seats.${row.seat}`) }}
                    </span>
                  </div>
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="font-mono text-xl font-bold text-mahjong-text" data-test="mesa-score">
                      {{ n(row.score, 'points') }}
                    </span>
                    <span
                      class="font-mono text-sm"
                      :class="row.deltaClass"
                      data-test="mesa-delta"
                    >
                      {{ row.deltaText }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between mt-2">
                    <span
                      v-if="row.isDealer"
                      class="px-1.5 py-0.5 text-xs rounded border border-mahjong-border text-mahjong-muted"
                      data-test="mesa-dealer"
                    >
                      {{ t('turnForm.mesa.dealer') }}
                    </span>
                    <span
                      v-if="row.hasRiichi"
                      class="px-1.5 py-0.5 text-xs rounded-full bg-mahjong-accent/20 text-mahjong-accent shadow-glow-red"
                      data-test="mesa-riichi"
                    >
                      {{ t('turnForm.riichi') }}
                    </span>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>
        </div>

        <!-- Columna 2: Formulario de captura -->
        <div>
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">
              {{ t('gamesView.turns') }}
            </h2>

            <div
              v-if="session.status === 'authenticated' && game.status === 'open'"
              class="flex flex-wrap gap-2"
            >
              <BaseButton
                v-if="!game.mustFinalize && game.ruleset === 'mahjongSouls'"
                @click="finalizeDialog = true"
              >
                {{ t('gamesView.finalize') }}
              </BaseButton>
              <BaseButton v-if="game.mustFinalize" @click="finalizeDialog = true">
                {{ t('gamesView.finalize') }}
              </BaseButton>
              <BaseButton
                v-if="offersAbandon(game.updatedAt, now())"
                variant="danger"
                @click="abandonDialog = true"
              >
                {{ t('gamesView.abandon') }}
              </BaseButton>
            </div>

            <p
              v-if="game.status === 'open' && offersAbandon(game.updatedAt, now())"
              class="text-xs text-mahjong-warning"
              data-test="stale-notice"
            >
              {{ t('gamesView.staleWarning') }}
            </p>

            <div v-if="session.status === 'authenticated' && game.status === 'finalized'">
              <BaseButton variant="ghost" @click="unfinalizeDialog = true">
                {{ t('gamesView.unfinalize') }}
              </BaseButton>
            </div>
          </div>

          <TurnForm v-if="canCapture" :game="game" />
        </div>

        <!-- Columna 3: Listado de turnos capturados -->
        <div>
          <div class="relative pl-4 border-l border-mahjong-border" data-test="turn-timeline">
            <ul
              v-if="(turns ?? []).length > 0"
              class="divide-y divide-mahjong-border rounded border border-mahjong-border bg-mahjong-surface"
            >
            <li
              v-for="turn in turns ?? []"
              :key="turn.turnNo"
              class="flex flex-col gap-1 px-3 py-2 text-sm"
            >
              <div class="flex items-center justify-between">
                <span>
                  <span class="font-medium">T{{ turn.turnNo }}</span>
                  <span class="text-mahjong-muted">
                    · {{ t(`turnForm.resultTypes.${turn.resultType}`) }}
                  </span>
                  <span class="text-mahjong-muted">
                    · {{ t('gamesView.capturedBy') }}: {{ turn.capturedBy }}
                  </span>
                </span>
                <BaseButton
                  v-if="turn.turnNo === (turns?.length ?? 0) && session.status === 'authenticated' && game.status === 'open'"
                  :data-test="`delete-turn-${turn.turnNo}`"
                  variant="ghost"
                  size="sm"
                  @click="deleteTurnNo = turn.turnNo; deleteTurnDialog = true"
                >
                  {{ t('gamesView.deleteTurn') }}
                </BaseButton>
              </div>
              <ul
                v-if="turn.audit.length > 0"
                class="flex flex-col gap-1 text-xs text-mahjong-muted"
                data-test="turn-audit"
              >
                <li v-for="(entry, index) in turn.audit" :key="`${entry.at.seconds}-${index}`">
                  <template v-if="entry.action === 'delete'">
                    {{ t('gamesView.turnDeleted', { turn: entry.turnNo, at: atOf(entry.at) }) }}
                  </template>
                  <template v-else>
                    {{ t('gamesView.correctedBy', { by: entry.by, at: atOf(entry.at) }) }}
                    <span>
                      <span v-for="change in entry.changes" :key="change.field" class="ml-2">
                        {{ fieldLabel(change.field) }} {{ t('gamesView.audit.from') }}
                        {{ change.from }} {{ t('gamesView.audit.to') }} {{ change.to }} ({{
                          change.derived
                            ? t('gamesView.audit.derived')
                            : t('gamesView.audit.manual')
                        }})
                      </span>
                    </span>
                  </template>
                </li>
              </ul>
            </li>
            </ul>

            <p v-if="(turns ?? []).length === 0" class="px-3 py-4 text-sm text-mahjong-muted">
              {{ t('gamesView.noTurns') }}
            </p>

            <ul
              v-if="(game.turnAudit ?? []).length > 0"
            class="mt-3 flex flex-col gap-1 rounded border border-mahjong-border px-3 py-2 text-xs text-mahjong-muted"
            data-test="game-turn-audit"
          >
            <li class="text-mahjong-muted">{{ t('gamesView.audit.deletedInGame') }}</li>
            <li v-for="(entry, index) in game.turnAudit" :key="`${entry.at.seconds}-${index}`">
              {{ t('gamesView.turnDeleted', { turn: entry.turnNo, at: atOf(entry.at) }) }}
              {{ entry.by }}
            </li>
          </ul>
        </div>
      </div>
      </div>
    </template>

    <BaseDialog
      :open="finalizeDialog"
      :title="t('gamesView.confirmFinalize')"
      @close="finalizeDialog = false"
    >
      <p class="mb-4 text-sm text-mahjong-muted">{{ t('gamesView.confirmFinalizeHint') }}</p>
      <div class="flex justify-end gap-2">
        <BaseButton variant="ghost" @click="finalizeDialog = false">
          {{ t('gamesView.cancel') }}
        </BaseButton>
        <BaseButton :disabled="finalizeGame.isLoading.value" @click="confirmFinalize">
          {{ t('gamesView.confirm') }}
        </BaseButton>
      </div>
    </BaseDialog>

    <BaseDialog
      :open="unfinalizeDialog"
      :title="t('gamesView.confirmUnfinalize')"
      @close="unfinalizeDialog = false"
    >
      <p class="mb-4 text-sm text-mahjong-muted">{{ t('gamesView.confirmUnfinalizeHint') }}</p>
      <div class="flex justify-end gap-2">
        <BaseButton variant="ghost" @click="unfinalizeDialog = false">
          {{ t('gamesView.cancel') }}
        </BaseButton>
        <BaseButton :disabled="unfinalizeGame.isLoading.value" @click="confirmUnfinalize">
          {{ t('gamesView.confirm') }}
        </BaseButton>
      </div>
    </BaseDialog>

    <BaseDialog
      :open="abandonDialog"
      :title="t('gamesView.confirmAbandon')"
      @close="abandonDialog = false"
    >
      <p class="mb-4 text-sm text-mahjong-muted">{{ t('gamesView.confirmAbandonHint') }}</p>
      <div class="flex justify-end gap-2">
        <BaseButton variant="ghost" @click="abandonDialog = false">
          {{ t('gamesView.cancel') }}
        </BaseButton>
        <BaseButton
          variant="danger"
          :disabled="abandonGame.isLoading.value"
          @click="confirmAbandon"
        >
          {{ t('gamesView.confirm') }}
        </BaseButton>
      </div>
    </BaseDialog>

    <BaseDialog
      :open="deleteTurnDialog"
      :title="t('gamesView.confirmDeleteTurn', { turn: deleteTurnNo })"
      @close="deleteTurnDialog = false; deleteTurnNo = null; deleteTurnError = null"
    >
      <p class="mb-4 text-sm text-mahjong-muted">
        {{ t('gamesView.confirmDeleteTurnHint') }}
      </p>
      <p v-if="deleteTurnError" class="mb-4 text-sm text-mahjong-negative" data-test="delete-turn-error">
        {{ deleteTurnError }}
      </p>
      <div class="flex justify-end gap-2">
        <BaseButton variant="ghost" @click="deleteTurnDialog = false; deleteTurnNo = null; deleteTurnError = null">
          {{ t('gamesView.cancel') }}
        </BaseButton>
        <BaseButton
          :data-test="`delete-turn-confirm`"
          variant="danger"
          :disabled="deleteTurn.isLoading.value"
          @click="confirmDeleteTurn"
        >
          {{ t('gamesView.confirm') }}
        </BaseButton>
      </div>
    </BaseDialog>
  </section>
</template>
