<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import SeasonForm from '@/components/seasons/SeasonForm.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import { useSeasons } from '@/composables/useSeasons'
import type { SeasonId } from '@/domain/types'
import type { Timestamp } from '@/domain/types'

defineProps<{ creating?: boolean }>()

const { t } = useI18n()
const router = useRouter()
const { data: seasons, closeSeason } = useSeasons()

const closeTarget = ref<{ id: SeasonId; title: string } | null>(null)

function formatDate(timestamp: Timestamp): string {
  const date = new Date(timestamp.seconds * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

async function handleSaved(): Promise<void> {
  await router.push('/temporadas')
}

function handleCancel(): void {
  void router.push('/temporadas')
}

async function confirmClose(): Promise<void> {
  if (closeTarget.value === null) {
    return
  }

  await closeSeason.mutateAsync(closeTarget.value.id)
  closeTarget.value = null
}
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">
        {{ t(creating ? 'seasonsView.newTitle' : 'seasonsView.title') }}
      </h1>
      <RouterLink v-if="!creating" to="/temporadas/nueva" class="text-sm text-mahjong-accent">
        {{ t('nav.newSeason') }}
      </RouterLink>
    </div>

    <template v-if="creating">
      <SeasonForm @saved="handleSaved" @cancel="handleCancel" />
    </template>

    <template v-else>
      <div
        v-if="(seasons ?? []).length === 0"
        class="rounded border border-mahjong-border bg-mahjong-surface p-4 text-sm text-mahjong-muted"
      >
        {{ t('seasonsView.noSeasons') }}
      </div>

      <ul
        v-else
        class="divide-y divide-mahjong-border rounded border border-mahjong-border bg-mahjong-surface"
      >
        <li
          v-for="season in seasons ?? []"
          :key="season.id"
          class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        >
          <div>
            <p class="font-medium">
              {{ season.title }}
            </p>
            <p class="text-sm text-mahjong-muted">
              {{
                t('seasonsView.dateRange', {
                  from: formatDate(season.dateFrom),
                  to: formatDate(season.dateTo),
                })
              }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <span
              :class="[
                'rounded-full px-3 py-1 text-sm',
                season.status === 'open'
                  ? 'bg-mahjong-accent/10 text-mahjong-accent'
                  : 'bg-mahjong-border/40 text-mahjong-muted',
              ]"
            >
              {{ t(season.status === 'open' ? 'seasonsView.open' : 'seasonsView.closed') }}
            </span>
            <BaseButton
              v-if="season.status === 'open'"
              variant="danger"
              @click="closeTarget = { id: season.id, title: season.title }"
            >
              {{ t('seasonsView.close') }}
            </BaseButton>
          </div>
        </li>
      </ul>

      <BaseDialog
        :open="closeTarget !== null"
        :title="t('seasonsView.confirmClose', { title: closeTarget?.title ?? '' })"
        @close="closeTarget = null"
      >
        <p class="mb-4 text-sm text-mahjong-muted">{{ t('seasonsView.confirmCloseHint') }}</p>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" @click="closeTarget = null">
            {{ t('seasonsView.cancel') }}
          </BaseButton>
          <BaseButton variant="danger" @click="confirmClose">
            {{ t('seasonsView.confirm') }}
          </BaseButton>
        </div>
      </BaseDialog>
    </template>
  </section>
</template>
