<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import GameForm from '@/components/games/GameForm.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/components/ui/BaseSelect.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import type { CellValue, TableColumn } from '@/components/ui/BaseTable.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useGames } from '@/composables/useGames'
import { usePlayers } from '@/composables/usePlayers'
import { useSeasons } from '@/composables/useSeasons'
import { toPlayerId, toSeasonId } from '@/domain/types'
import type { GameRecord } from '@/data/games.repository'
import { RouterLink } from 'vue-router'

defineProps<{ creating?: boolean }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { data: players } = usePlayers()
const { data: seasons } = useSeasons()

/** T86 y RF-12.5: la URL puede venir ya filtrada desde estadísticas o ranking. */
function queryParam(name: string): string {
  const value = route.query[name]

  return typeof value === 'string' ? value : ''
}

const seasonChoice = ref<string>(queryParam('season'))
const selectedSeason = computed(() =>
  seasonChoice.value.length === 0 ? null : toSeasonId(seasonChoice.value),
)

const { openGames, data: seasonGames } = useGames(selectedSeason)
const playerFilter = computed(() => {
  const value = queryParam('player')

  return value.length === 0 ? null : toPlayerId(value)
})

const seasonOptions = computed<readonly SelectOption[]>(() => [
  { value: '', label: t('gamesView.allOpen') },
  ...(seasons.value ?? []).map((season) => ({ value: season.id, label: season.title })),
])

/** RF-12.5: `seasonGames` ya es el `Ref` de datos de `useGames`; sin temporada se listan las abiertas. */
const source = computed<readonly GameRecord[]>(() =>
  selectedSeason.value === null ? (openGames.data?.value ?? []) : (seasonGames.value ?? []),
)

const columns = computed<readonly TableColumn[]>(() => [
  { key: 'date', header: t('gamesView.date') },
  { key: 'length', header: t('gamesView.length') },
  { key: 'status', header: t('gamesView.status') },
  { key: 'players', header: t('gamesView.player') },
])

const rows = computed<readonly Record<string, CellValue>[]>(() => {
  const byId = new Map((players.value ?? []).map((player) => [player.id, player.name] as const))
  const filtered =
    playerFilter.value === null
      ? source.value
      : source.value.filter((game) =>
          game.players.some((participant) => participant.playerId === playerFilter.value),
        )

  return filtered.map((game) => ({
    id: game.id,
    date: new Date(game.date.seconds * 1000),
    length: t(`gamesView.${game.gameLength}`),
    status: t(`gamesView.statuses.${game.status}`),
    players: game.players
      .map((participant) => byId.get(participant.playerId) ?? participant.playerId)
      .join(', '),
  }))
})

const emptyMessage = computed(() =>
  selectedSeason.value === null ? t('gamesView.openEmpty') : t('gamesView.seasonEmpty'),
)

function openRow(row: Record<string, CellValue>): void {
  void router.push(`/partidas/${String(row.id)}`)
}

async function handleSaved(game: GameRecord): Promise<void> {
  await router.push(`/partidas/${game.id}`)
}

function handleCancel(): void {
  void router.push('/partidas')
}
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-xl font-semibold">
        {{ t(creating ? 'gamesView.newTitle' : 'gamesView.title') }}
      </h1>
      <RouterLink v-if="!creating" to="/partidas/nueva">
        <BaseButton variant="success">
          {{ t('nav.newGame') }}
        </BaseButton>
      </RouterLink>
    </div>

    <template v-if="creating">
      <GameForm @saved="handleSaved" @cancel="handleCancel" />
    </template>

    <template v-else>
      <label class="mb-3 block max-w-xs text-sm">
        <span>{{ t('gamesView.seasonFilter') }}</span>
        <BaseSelect v-model="seasonChoice" :options="seasonOptions" name="season" />
      </label>

      <BaseTable
        :columns="columns"
        :rows="rows"
        :empty-message="emptyMessage"
        @row-click="openRow"
      />
    </template>
  </section>
</template>
