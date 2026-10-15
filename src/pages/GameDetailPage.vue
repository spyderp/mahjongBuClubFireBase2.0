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
import type { PlayerId, Position, Seat } from '@/domain/types'
import { offersAbandon } from '@/domain/game'
import type { GameRecord } from '@/data/games.repository'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ gameId: string }>()

const { t } = useI18n()
const session = useSessionStore()
const gameId = computed(() => toGameId(props.gameId))
const { state: gameState, refresh: refreshGame } = useGameDetail(gameId)
const { data: turns } = useGameTurns(gameId)
const { data: players } = usePlayers()
const { finalizeGame, unfinalizeGame, abandonGame } = useGames()

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

const finalizeDialog = ref(false)
const unfinalizeDialog = ref(false)
const abandonDialog = ref(false)

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

const canCapture = computed(
  () =>
    game.value !== undefined &&
    session.status === 'authenticated' &&
    game.value.status === 'open' &&
    !game.value.mustFinalize &&
    game.value.ruleset === 'mahjongSouls',
)

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

      <div class="grid gap-4 lg:grid-cols-2">
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
                <th v-if="game.status === 'finalized'" class="px-2 py-1 text-end font-medium">
                  {{ t('gamesView.position') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in standings"
                :key="entry.playerId"
                class="border-b border-mahjong-border last:border-b-0"
              >
                <td class="px-2 py-1">{{ nameOf(entry.playerId) }}</td>
                <td class="px-2 py-1">{{ t(`gamesView.seats.${entry.seat}`) }}</td>
                <td class="px-2 py-1 text-end">{{ entry.score }}</td>
                <td v-if="entry.position !== null" class="px-2 py-1 text-end">
                  {{ t(`uma.${entry.position}`) }}
                </td>
              </tr>
            </tbody>
          </table>

          <p class="mt-3 text-sm text-mahjong-muted">
            {{ t('gamesView.riichiPot') }}: {{ riichiSticks }}
          </p>
        </div>

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

          <ul
            class="divide-y divide-mahjong-border rounded border border-mahjong-border bg-mahjong-surface"
          >
            <li v-for="turn in turns ?? []" :key="turn.turnNo" class="px-3 py-2 text-sm">
              <span class="font-medium">T{{ turn.turnNo }}</span>
              <span class="text-mahjong-muted">
                · {{ t(`turnForm.resultTypes.${turn.resultType}`) }}
              </span>
              <span class="text-mahjong-muted">
                · {{ t('gamesView.capturedBy') }}: {{ turn.capturedBy }}
              </span>
            </li>
            <li v-if="(turns ?? []).length === 0" class="px-3 py-4 text-sm text-mahjong-muted">
              {{ t('gamesView.noTurns') }}
            </li>
          </ul>
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
  </section>
</template>
