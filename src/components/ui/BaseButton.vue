<script setup lang="ts">
type ButtonType = 'button' | 'submit' | 'reset'
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'info' | 'warning'
type ButtonSize = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    type?: ButtonType
    variant?: ButtonVariant
    size?: ButtonSize
    disabled?: boolean
  }>(),
  { type: 'button', variant: 'primary', size: 'md', disabled: false },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-mahjong-accent text-mahjong-bg hover:bg-mahjong-accent-soft',
  secondary:
    'border border-mahjong-border bg-mahjong-surface text-mahjong-text hover:border-mahjong-muted',
  ghost: 'text-mahjong-muted hover:bg-mahjong-surface hover:text-mahjong-text',
  danger: 'bg-mahjong-negative text-mahjong-bg hover:bg-mahjong-accent-soft',
  success: 'bg-mahjong-positive text-mahjong-bg hover:bg-mahjong-green',
  info: 'bg-mahjong-blue text-mahjong-bg hover:bg-mahjong-blue/80',
  warning: 'bg-mahjong-gold text-mahjong-bg hover:bg-mahjong-gold/80',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
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
      'inline-flex items-center justify-center gap-1 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      variantClass[variant],
      sizeClass[size],
    ]"
    @click="handleClick"
  >
    <slot />
  </button>
</template>
