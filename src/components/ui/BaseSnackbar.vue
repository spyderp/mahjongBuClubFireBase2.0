<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'

type SnackbarType = 'info' | 'error' | 'success'

const props = withDefaults(
  defineProps<{
    message: string
    type?: SnackbarType
    durationMs?: number
  }>(),
  { type: 'info', durationMs: 0 },
)

const emit = defineEmits<{ dismiss: [] }>()

const typeClass: Record<SnackbarType, string> = {
  info: 'border-mahjong-accent',
  error: 'border-mahjong-negative',
  success: 'border-mahjong-positive',
}

let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => [props.message, props.durationMs] as const,
  () => schedule(),
)

onMounted(schedule)
onBeforeUnmount(() => clear())

function schedule(): void {
  clear()

  if (props.durationMs > 0) {
    timer = setTimeout(() => emit('dismiss'), props.durationMs)
  }
}

function clear(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}
</script>

<template>
  <div
    role="alert"
    :class="['rounded border-l-4 bg-mahjong-surface px-4 py-2 text-sm', typeClass[type]]"
  >
    <div class="flex items-center justify-between gap-3">
      <span>{{ message }}</span>
      <button class="text-mahjong-muted hover:text-mahjong-text" @click="emit('dismiss')">×</button>
    </div>
  </div>
</template>
