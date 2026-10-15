<script setup lang="ts">
export interface SelectOption {
  readonly value: string
  readonly label: string
}

defineProps<{
  modelValue: string
  options: readonly SelectOption[]
  name?: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function handleChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <select
    :value="modelValue"
    :name="name"
    :disabled="disabled"
    class="w-full rounded border border-mahjong-border bg-mahjong-bg px-3 py-1.5 text-sm focus:border-mahjong-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    @change="handleChange"
  >
    <option v-if="placeholder" value="" disabled>
      {{ placeholder }}
    </option>
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
