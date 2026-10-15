<script setup lang="ts">
import { useI18n } from 'vue-i18n'

export type CellValue = string | number | Date | null

export interface TableColumn {
  readonly key: string
  readonly header: string
  readonly align?: 'start' | 'end'
}

defineProps<{
  columns: readonly TableColumn[]
  rows: readonly Record<string, CellValue>[]
  emptyMessage?: string
}>()

const emit = defineEmits<{ rowClick: [row: Record<string, CellValue>] }>()

const { n, d } = useI18n()

function formatCell(cell: CellValue): string {
  if (cell === null) {
    return '—'
  }

  if (typeof cell === 'number') {
    return n(cell, 'points')
  }

  if (cell instanceof Date) {
    return d(cell, 'short')
  }

  return cell
}

function alignClass(align: 'start' | 'end' | undefined): string {
  return align === 'end' ? 'text-end' : 'text-start'
}
</script>

<template>
  <div class="overflow-x-auto rounded border border-mahjong-border bg-mahjong-surface">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-mahjong-border text-mahjong-muted">
          <th
            v-for="column in columns"
            :key="column.key"
            :class="['px-3 py-2 font-medium', alignClass(column.align)]"
          >
            {{ column.header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="rows.length === 0">
          <tr>
            <td :colspan="columns.length" class="px-3 py-4 text-center text-mahjong-muted">
              {{ emptyMessage }}
            </td>
          </tr>
        </template>
        <template v-else>
          <tr
            v-for="(row, index) in rows"
            :key="index"
            class="cursor-pointer border-b border-mahjong-border last:border-b-0 hover:bg-mahjong-border/30"
            @click="emit('rowClick', row)"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              :class="['px-3 py-2', alignClass(column.align)]"
            >
              {{ formatCell(row[column.key] ?? null) }}
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
