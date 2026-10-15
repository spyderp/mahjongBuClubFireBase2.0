<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGames } from '@/composables/useGames'
import { usePlayers } from '@/composables/usePlayers'
import { useSeasons } from '@/composables/useSeasons'

const { t } = useI18n()
const { openGames } = useGames()
const { data: players } = usePlayers()
const { data: seasons } = useSeasons()

interface DashboardTile {
  readonly to: string
  readonly label: string
  readonly count: number | null
}

/** T85 · Panel (RNF-4): accesos a todas las secciones con contadores de lo que cambia cada día. */
const tiles = computed<readonly DashboardTile[]>(() => [
  { to: '/partidas', label: t('dashboard.games'), count: openGames.data.value?.length ?? null },
  { to: '/jugadores', label: t('dashboard.players'), count: players.value?.length ?? null },
  {
    to: '/temporadas',
    label: t('dashboard.seasons'),
    count: seasons.value?.filter((season) => season.status === 'open').length ?? null,
  },
  { to: '/estadisticas', label: t('dashboard.stats'), count: null },
  { to: '/ranking', label: t('dashboard.rankings'), count: null },
  { to: '/partidas/nueva', label: t('dashboard.newGame'), count: null },
])
</script>

<template>
  <section aria-label="Panel">
    <RouterLink to="/">
      <h1 class="text-xl font-semibold">
        {{ t('app.title') }}
      </h1>
    </RouterLink>
    <p class="text-sm text-mahjong-muted">
      {{ t('app.tagline') }}
    </p>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <RouterLink
        v-for="tile in tiles"
        :key="tile.to"
        :to="tile.to"
        class="rounded border border-mahjong-border bg-mahjong-surface p-4 transition-colors hover:border-mahjong-accent"
      >
        <span class="text-sm text-mahjong-muted">{{ tile.label }}</span>
        <strong v-if="tile.count !== null" class="block text-3xl font-semibold text-mahjong-text">
          {{ tile.count }}
        </strong>
      </RouterLink>
    </div>
  </section>
</template>
