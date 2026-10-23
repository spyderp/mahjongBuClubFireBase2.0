<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/components/ui/BaseSelect.vue'
import { usePlayers } from '@/composables/usePlayers'
import { useRankings } from '@/composables/useRankings'
import { useSeasons } from '@/composables/useSeasons'
import { toSeasonId } from '@/domain/types'
import type { PlayerId, SeasonId } from '@/domain/types'
import { usePreferencesStore } from '@/stores/preferences'

const { t } = useI18n()
const preferences = usePreferencesStore()
const seasonChoice = ref<string>(preferences.lastSeasonId ?? '')

const selectedSeason = computed<SeasonId | null>(() =>
  seasonChoice.value.length === 0 ? null : toSeasonId(seasonChoice.value),
)

const { data: players } = usePlayers()
const { data: seasons } = useSeasons()
const { data: rankings } = useRankings(selectedSeason)

watch(seasonChoice, (value) => {
  preferences.setLastSeason(value.length === 0 ? null : toSeasonId(value))
})

const seasonOptions = computed<readonly SelectOption[]>(() => [
  { value: '', label: t('rankingsView.pickSeason') },
  ...(seasons.value ?? []).map((season) => ({ value: season.id, label: season.title })),
])

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

const empty = computed(() => selectedSeason.value !== null && (rankings.value ?? []).length === 0)

/** RF-13.1: el pódium usa la misma numeración ordinal que la urna, el resto consigue su puesto. */
function rankLabel(rank: number): string {
  if (rank >= 1 && rank <= 4) {
    return t(`uma.${['1st', '2nd', '3rd', '4th'][rank - 1]}`)
  }

  return `${rank}º`
}

function rankClass(rank: number): string {
  if (rank === 1) return 'text-mahjong-gold font-bold'
  if (rank === 2) return 'text-silver font-semibold'
  if (rank === 3) return 'text-amber-600 font-medium'
  return 'text-mahjong-muted'
}
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-xl font-semibold">
        {{ t('rankingsView.title') }}
      </h1>
      <label class="block max-w-xs">
        <span class="text-sm text-mahjong-muted">{{ t('rankingsView.season') }}</span>
        <BaseSelect v-model="seasonChoice" :options="seasonOptions" name="season" />
      </label>
    </div>

    <div
      v-if="selectedSeason === null"
      class="rounded border border-mahjong-border bg-mahjong-surface p-4 text-sm text-mahjong-muted"
    >
      {{ t('rankingsView.pickSeason') }}
    </div>

    <div
      v-else-if="empty"
      class="rounded border border-mahjong-border bg-mahjong-surface p-4 text-sm text-mahjong-muted"
    >
      {{ t('rankingsView.empty') }}
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-mahjong-border text-mahjong-muted">
          <th class="px-3 py-2 text-start font-medium">{{ t('rankingsView.position') }}</th>
          <th class="px-3 py-2 text-start font-medium">{{ t('rankingsView.player') }}</th>
          <th class="px-3 py-2 text-end font-medium">{{ t('rankingsView.points') }}</th>
          <th class="px-3 py-2 text-end font-medium">{{ t('rankingsView.games') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in rankings ?? []"
          :key="entry.playerId"
          class="border-b border-mahjong-border last:border-b-0"
          :class="entry.rank <= 3 ? 'bg-mahjong-border/20' : ''"
        >
          <td class="px-3 py-2" :class="rankClass(entry.rank)">{{ rankLabel(entry.rank) }}</td>
          <td class="px-3 py-2">
            <RouterLink
              :to="`/partidas?season=${String(selectedSeason)}&player=${entry.playerId}`"
              class="text-mahjong-accent hover:underline font-medium"
            >
              {{ nameOf(entry.playerId) }}
            </RouterLink>
          </td>
          <td class="px-3 py-2 text-end font-mono">{{ entry.points }}</td>
          <td class="px-3 py-2 text-end">{{ entry.gamesPlayed }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
