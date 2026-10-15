<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import PointsEvolutionChart from '@/components/charts/PointsEvolutionChart.vue'
import PositionsChart from '@/components/charts/PositionsChart.vue'
import YakuChart from '@/components/charts/YakuChart.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/components/ui/BaseSelect.vue'
import { useGames } from '@/composables/useGames'
import { usePlayerSeasonStats } from '@/composables/usePlayerSeasonStats'
import { usePlayers } from '@/composables/usePlayers'
import { useSeasons } from '@/composables/useSeasons'
import { toSeasonId } from '@/domain/types'
import type { PlayerId, SeasonId } from '@/domain/types'
import { usePreferencesStore } from '@/stores/preferences'

const { t } = useI18n()
const preferences = usePreferencesStore()
const defaultSeason = preferences.lastSeasonId
const seasonChoice = ref<string>(defaultSeason ?? '')

const selectedSeason = computed<SeasonId | null>(() =>
  seasonChoice.value.length === 0 ? null : toSeasonId(seasonChoice.value),
)

const { data: players } = usePlayers()
const { data: seasons } = useSeasons()
const { data: stats } = usePlayerSeasonStats(selectedSeason)
const { data: seasonGames } = useGames(selectedSeason)

watch(seasonChoice, (value) => {
  preferences.setLastSeason(value.length === 0 ? null : toSeasonId(value))
})

const seasonOptions = computed<readonly SelectOption[]>(() => [
  { value: '', label: t('statsView.pickSeason') },
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

const empty = computed(() => selectedSeason.value !== null && (stats.value ?? []).length === 0)

const positions = { '1st': 0, '2nd': 0, '3rd': 0, '4th': 0 }
const yakuTotals = {
  riichi: 0,
  dora: 0,
  kan: 0,
  tsumo: 0,
  ron: 0,
  chombo: 0,
  haiteiRaoyue: 0,
  rinshanKaihou: 0,
  yakuman: 0,
}

/** T88 · RF-12.4: la posición domina los contadores de cada jugador. */
const positionCounts = computed<readonly { label: string; count: number }[]>(() => {
  const counts = { ...positions }

  for (const player of stats.value ?? []) {
    for (const [key, value] of Object.entries(player.positions)) {
      counts[key as keyof typeof positions] += value
    }
  }

  return (['1st', '2nd', '3rd', '4th'] as const).map((key) => ({
    label: t(`uma.${key}`),
    count: counts[key],
  }))
})

/** T88 · RF-12.4: los nueve contadores agregados de yaku delante de cada jugador. */
const yakuCounts = computed<readonly { label: string; count: number }[]>(() => {
  const totals = { ...yakuTotals }

  for (const player of stats.value ?? []) {
    for (const [key, value] of Object.entries(player.yakuStats)) {
      totals[key as keyof typeof yakuTotals] += value
    }
  }

  return (Object.keys(yakuTotals) as (keyof typeof yakuTotals)[]).map((key) => ({
    label: t(`statsView.yakuLabels.${key}`),
    count: totals[key],
  }))
})

/** T88 · RF-12.4: evolución acumulada del marcador final por jugador, partida a partida. */
const evolutionSeries = computed<readonly { label: string; points: readonly number[] }[]>(() => {
  const finalized = (seasonGames.value ?? [])
    .filter((game) => game.status === 'finalized')
    .slice()
    .sort((a, b) => a.date.seconds - b.date.seconds)

  const byPlayer = new Map<PlayerId, number[]>()

  for (const game of finalized) {
    for (const result of game.results) {
      const list = byPlayer.get(result.playerId) ?? []
      list.push((list.at(-1) ?? 0) + result.finalScore)
      byPlayer.set(result.playerId, list)
    }
  }

  return (stats.value ?? []).map((player) => ({
    label: nameOf(player.playerId),
    points: byPlayer.get(player.playerId) ?? [],
  }))
})
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">
        {{ t('statsView.title') }}
      </h1>
      <label class="block max-w-xs">
        <span class="text-sm text-mahjong-muted">{{ t('statsView.season') }}</span>
        <BaseSelect v-model="seasonChoice" :options="seasonOptions" name="season" />
      </label>
    </div>

    <div
      v-if="selectedSeason === null"
      class="rounded border border-mahjong-border bg-mahjong-surface p-4 text-sm text-mahjong-muted"
    >
      {{ t('statsView.pickSeason') }}
    </div>

    <div
      v-else-if="empty"
      class="rounded border border-mahjong-border bg-mahjong-surface p-4 text-sm text-mahjong-muted"
    >
      {{ t('statsView.empty') }}
    </div>

    <template v-else>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-mahjong-border text-mahjong-muted">
            <th class="px-3 py-2 text-start font-medium">{{ t('statsView.tableHeadPlayer') }}</th>
            <th class="px-3 py-2 text-end font-medium">{{ t('statsView.tableHeadGames') }}</th>
            <th class="px-3 py-2 text-end font-medium">{{ t('statsView.tableHeadWins') }}</th>
            <th class="px-3 py-2 text-end font-medium">{{ t('statsView.tableHeadPoints') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="player in stats ?? []"
            :key="player.playerId"
            class="border-b border-mahjong-border last:border-b-0"
          >
            <td class="px-3 py-2">
              <RouterLink
                :to="`/partidas?season=${String(selectedSeason)}&player=${player.playerId}`"
                class="text-mahjong-accent hover:underline"
              >
                {{ nameOf(player.playerId) }}
              </RouterLink>
            </td>
            <td class="px-3 py-2 text-end">{{ player.gamesPlayed }}</td>
            <td class="px-3 py-2 text-end">{{ player.victories }}</td>
            <td class="px-3 py-2 text-end">{{ player.actualPoints }}</td>
          </tr>
        </tbody>
      </table>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <PointsEvolutionChart :title="t('statsView.evolutionTitle')" :series="evolutionSeries" />
        <PositionsChart :title="t('statsView.positionsTitle')" :positions="positionCounts" />
        <YakuChart :title="t('statsView.yakuTitle')" :yaku="yakuCounts" />
      </div>
    </template>
  </section>
</template>
