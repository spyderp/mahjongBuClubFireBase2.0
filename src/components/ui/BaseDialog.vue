<script setup lang="ts">
import BaseButton from '@/components/ui/BaseButton.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    closeOnEscape?: boolean
    closeOnBackdrop?: boolean
  }>(),
  { closeOnEscape: true, closeOnBackdrop: true },
)

const emit = defineEmits<{ close: [] }>()

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-start justify-center bg-mahjong-bg/60 p-4"
      @click.self="closeOnBackdrop ? emit('close') : undefined"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="mt-16 w-full max-w-md rounded border border-mahjong-border bg-mahjong-surface p-4 shadow-2xl"
        @keydown="closeOnEscape ? handleKeydown($event) : undefined"
      >
        <header class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold">
            {{ title }}
          </h2>
          <BaseButton variant="ghost" aria-label="Cerrar" @click="emit('close')"> × </BaseButton>
        </header>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
