<script setup lang="ts">
type InputType = 'text' | 'number' | 'date' | 'email' | 'password'

defineProps<{
  modelValue: string
  type?: InputType
  name?: string
  placeholder?: string
  disabled?: boolean
  /** T97 · RF-15.9: lo usa el acceso (`email`, `current-password`) para no reescribir el input. */
  autocomplete?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
  blur: []
}>()

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :name="name"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    class="w-full rounded border border-mahjong-border bg-mahjong-bg px-3 py-1.5 text-sm placeholder:text-mahjong-muted focus:border-mahjong-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    @input="handleInput"
    @focus="emit('focus')"
    @blur="emit('blur')"
  />
</template>
