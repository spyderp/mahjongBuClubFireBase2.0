<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSnackbar from '@/components/ui/BaseSnackbar.vue'
import { useSeasons } from '@/composables/useSeasons'
import { findOverlapping, validateSeasonRange } from '@/domain/seasons'
import type { Timestamp as DomainTimestamp } from '@/domain/types'
import type { SeasonRecord } from '@/data/seasons.repository'

const emit = defineEmits<{
  saved: [season: SeasonRecord]
  cancel: []
}>()

const { t } = useI18n()
const { data: seasons, createSeason } = useSeasons()

const title = ref('')
const dateFrom = ref('')
const dateTo = ref('')

/** RF-11.2: el solapamiento bloquea la creación; RF-11.3: el rango invertido también. */
const errors = reactive<{ title: string | null; range: string | null; save: string | null }>({
  title: null,
  range: null,
  save: null,
})

function toTimestamp(date: string): DomainTimestamp {
  return { seconds: new Date(`${date}T00:00:00`).getTime() / 1000, nanoseconds: 0 }
}

async function handleSubmit(): Promise<void> {
  errors.save = null
  const cleanTitle = title.value.trim()

  errors.title = cleanTitle.length === 0 ? t('errors.season.titleRequired') : null

  let rangeValid = false

  if (dateFrom.value.length > 0 && dateTo.value.length > 0) {
    const from = toTimestamp(dateFrom.value)
    const to = toTimestamp(dateTo.value)

    if (!validateSeasonRange(from, to)) {
      errors.range = t('errors.season.rangeInverted')
    } else {
      errors.range = null
      const overlapping = findOverlapping(seasons.value ?? [], from, to)
      rangeValid = overlapping === null

      if (overlapping !== null) {
        errors.range = t('errors.season.overlapping', { title: overlapping.title })
      }
    }
  } else {
    errors.range = null
  }

  if (cleanTitle.length === 0 || !rangeValid) {
    return
  }

  /**
   * El rechazo se captura y se pinta, igual que en `GameForm`: una escritura denegada por las reglas
   * no puede quedarse en una promesa rechazada que nadie ve. `emit('saved')` solo si la escritura
   * existe.
   */
  try {
    const created = await createSeason.mutateAsync({
      title: cleanTitle,
      dateFrom: toTimestamp(dateFrom.value),
      dateTo: toTimestamp(dateTo.value),
    })
    emit('saved', created)
  } catch {
    errors.save = t('errors.season.saveFailed')
  }
}

function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="handleSubmit">
    <h2 class="font-display text-lg font-semibold">
      {{ t('seasonsView.newTitle') }}
    </h2>

    <label class="flex flex-col gap-1 text-sm">
      <span>{{ t('seasonsView.name') }}</span>
      <BaseInput v-model="title" name="title" />
      <span v-if="errors.title !== null" class="text-xs text-mahjong-negative">
        {{ errors.title }}
      </span>
    </label>

    <div class="flex gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('seasonsView.dateFrom') }}</span>
        <BaseInput v-model="dateFrom" name="dateFrom" type="date" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('seasonsView.dateTo') }}</span>
        <BaseInput v-model="dateTo" name="dateTo" type="date" />
      </label>
    </div>

    <span v-if="errors.range !== null" class="text-xs text-mahjong-negative">
      {{ errors.range }}
    </span>

    <p
      v-if="errors.save !== null"
      role="alert"
      class="text-sm text-mahjong-negative"
      data-test="save-error"
    >
      {{ errors.save }}
    </p>

    <div class="flex gap-2">
      <BaseButton type="button" variant="ghost" @click="handleCancel">
        {{ t('common.cancel') }}
      </BaseButton>
      <BaseButton type="submit" :disabled="createSeason.isLoading.value">
        {{ t('common.save') }}
      </BaseButton>
    </div>

    <BaseSnackbar
      v-if="errors.range !== null"
      :message="errors.range"
      type="error"
      @dismiss="errors.range = null"
    />
  </form>
</template>
