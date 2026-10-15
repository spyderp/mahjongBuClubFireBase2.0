<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSnackbar from '@/components/ui/BaseSnackbar.vue'
import { usePlayers } from '@/composables/usePlayers'
import { validateExternalId, validatePlayerName } from '@/domain/types'
import type { PlayerRecord } from '@/data/players.repository'

const props = defineProps<{
  /** Jugador a editar (RF-1.4) o `null`/ausente para crear (RF-1.2). */
  player?: PlayerRecord | null
}>()

const emit = defineEmits<{
  saved: [player: PlayerRecord]
  cancel: []
}>()

const { t } = useI18n()
const { data: players, updatePlayer, createPlayer } = usePlayers()

const name = ref(props.player?.name ?? '')
const externalId = ref(props.player?.externalId ?? '')

/** Errores por campo salvo los duplicados, que se plantean como confirmación (RF-1.8). */
const errors = reactive<{
  name: string | null
  externalId: string | null
  duplicates: string | null
  save: string | null
}>({
  name: null,
  externalId: null,
  duplicates: null,
  save: null,
})

const confirming = ref(false)

const title = computed(() =>
  t(
    props.player === null || props.player === undefined
      ? 'playersView.newTitle'
      : 'playersView.editTitle',
  ),
)

async function handleSubmit(): Promise<void> {
  errors.save = null
  const nameCheck = validatePlayerName(name.value)

  if (!nameCheck.ok) {
    errors.name = nameCheck.reason === 'empty' ? 'nameEmpty' : 'nameTooLong'
  } else {
    errors.name = null
  }

  const rawExternalId = externalId.value.trim()
  const externalIdCheck = rawExternalId.length > 0 ? validateExternalId(rawExternalId) : null

  if (externalIdCheck !== null && !externalIdCheck.ok) {
    errors.externalId = 'externalIdInvalid'
  } else {
    errors.externalId = null
  }

  const editingId = props.player?.id
  const normalizedName = nameCheck.ok ? nameCheck.name : ''
  const normalizedExternalId = externalIdCheck?.ok ? externalIdCheck.externalId : ''

  const existing = players.value ?? []
  const duplicateName = existing.some(
    (player) =>
      player.id !== editingId && player.name.toLowerCase() === normalizedName.toLowerCase(),
  )
  const duplicateExternalId =
    normalizedExternalId.length > 0 &&
    existing.some((player) => player.id !== editingId && player.externalId === normalizedExternalId)

  if ((duplicateName || duplicateExternalId) && !confirming.value) {
    confirming.value = true
    errors.duplicates = t('errors.player.duplicatesConfirm')
    return
  }

  errors.duplicates = null

  if (!nameCheck.ok || (externalIdCheck !== null && !externalIdCheck.ok)) {
    return
  }

  /**
   * El rechazo se captura y se pinta, igual que en `GameForm` y `SeasonForm`: tanto el alta como la
   * edición pueden ser rechazadas por las reglas, y una promesa rechazada sin pintar hacía que un
   * guardado fallido pareciera correcto.
   */
  try {
    if (props.player) {
      const saved = await updatePlayer.mutateAsync({
        id: props.player.id,
        patch: { name: normalizedName, externalId: normalizedExternalId },
      })
      emit('saved', saved)

      return
    }

    const created = await createPlayer.mutateAsync({
      name: normalizedName,
      externalId: normalizedExternalId,
    })
    emit('saved', created)
  } catch {
    errors.save = t('errors.player.saveFailed')
  }
}

function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="handleSubmit">
    <h2 class="text-lg font-semibold">
      {{ title }}
    </h2>

    <label class="flex flex-col gap-1 text-sm">
      <span>{{ t('playersView.name') }}</span>
      <BaseInput v-model="name" name="name" />
      <span v-if="errors.name !== null" class="text-xs text-mahjong-negative">
        {{ t(`errors.player.${errors.name}`) }}
      </span>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span>{{ t('playersView.externalId') }}</span>
      <BaseInput v-model="externalId" name="externalId" />
      <span v-if="errors.externalId !== null" class="text-xs text-mahjong-negative">
        {{ t(`errors.player.${errors.externalId}`) }}
      </span>
    </label>

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
      <BaseButton
        type="submit"
        :disabled="createPlayer.isLoading.value || updatePlayer.isLoading.value"
      >
        {{ confirming ? t('common.confirm') : t('common.save') }}
      </BaseButton>
    </div>

    <BaseSnackbar
      v-if="errors.duplicates !== null"
      :message="errors.duplicates"
      type="info"
      @dismiss="errors.duplicates = null"
    />
  </form>
</template>
