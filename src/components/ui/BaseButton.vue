<script setup lang="ts">
type ButtonType = 'button' | 'submit' | 'reset'
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const props = withDefaults(
  defineProps<{
    type?: ButtonType
    variant?: ButtonVariant
    disabled?: boolean
  }>(),
  { type: 'button', variant: 'primary', disabled: false },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-mahjong-accent text-mahjong-bg hover:bg-mahjong-accent-soft',
  secondary:
    'border border-mahjong-border bg-mahjong-surface text-mahjong-text hover:border-mahjong-muted',
  ghost: 'text-mahjong-muted hover:bg-mahjong-surface hover:text-mahjong-text',
  danger: 'bg-mahjong-negative text-mahjong-bg hover:bg-mahjong-accent-soft',
}

function handleClick(event: MouseEvent): void {
  if (props.disabled) {
    return
  }

  emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center gap-1 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      variantClass[variant],
    ]"
    @click="handleClick"
  >
    <slot />
  </button>
</template>
