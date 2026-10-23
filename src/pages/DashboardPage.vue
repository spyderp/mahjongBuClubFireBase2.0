<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGames } from '@/composables/useGames'
import { usePlayers } from '@/composables/usePlayers'
import { useSeasons } from '@/composables/useSeasons'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const { openGames } = useGames()
const { data: players } = usePlayers()
const { data: seasons } = useSeasons()

interface DashboardTile {
  readonly to: string
  readonly label: string
  readonly count: number | null
  readonly icon: string
}

/** T85 · Panel (RNF-4): accesos a todas las secciones con contadores de lo que cambia cada día. */
const tiles = computed<readonly DashboardTile[]>(() => [
  {
    to: '/partidas',
    label: t('dashboard.games'),
    count: openGames.data.value?.length ?? null,
    icon: '🀄',
  },
  {
    to: '/jugadores',
    label: t('dashboard.players'),
    count: players.value?.length ?? null,
    icon: '👥',
  },
  {
    to: '/temporadas',
    label: t('dashboard.seasons'),
    count: seasons.value?.filter((season) => season.status === 'open').length ?? null,
    icon: '🏆',
  },
  { to: '/estadisticas', label: t('dashboard.stats'), count: null, icon: '📊' },
  { to: '/ranking', label: t('dashboard.rankings'), count: null, icon: '🥇' },
  { to: '/partidas/nueva', label: t('dashboard.newGame'), count: null, icon: '➕' },
])
</script>

<template>
  <section aria-label="Panel">
    <RouterLink to="/">
      <h1 class="font-display text-xl font-semibold">
        {{ t('app.title') }}
      </h1>
    </RouterLink>
    <p class="text-sm text-mahjong-muted">
      {{ t('app.tagline') }}
    </p>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="tile in tiles"
        :key="tile.to"
        :to="tile.to"
        class="rounded-xl border border-mahjong-border bg-mahjong-surface p-5 transition-all hover:border-mahjong-accent hover:shadow-glow-blue"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="text-sm text-mahjong-muted">{{ tile.label }}</span>
          <span class="text-2xl" aria-hidden="true">{{ tile.icon }}</span>
        </div>
        <strong
          v-if="tile.count !== null"
          class="block mt-2 font-mono text-3xl font-bold text-mahjong-text"
        >
          {{ tile.count }}
        </strong>
      </RouterLink>
    </div>
  </section>
</template>
