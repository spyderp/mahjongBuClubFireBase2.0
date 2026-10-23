<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'chart.js/auto'
import { chartPalette } from '@/styles/palette'

export interface PositionCount {
  readonly label: string
  readonly count: number
}

const props = defineProps<{
  title: string
  positions: readonly PositionCount[]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgb(${r} ${g} ${b})`
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Colores para posiciones: 1º gold, 2º silver, 3º amber-600, 4º red
// Usamos la paleta del tema y añadimos silver/amber-600
const positionColors = [
  chartPalette[2], // gold
  '#94a3b8', // silver
  '#d97706', // amber-600
  chartPalette[0], // red
].map((hex) => hexToRgb(hex ?? '#e63946'))

const positionColorsTransparent = [chartPalette[2], '#94a3b8', '#d97706', chartPalette[0]].map(
  (hex) => hexToRgba(hex ?? '#e63946', 0.2),
)

onMounted(() => {
  const element = canvas.value
  if (element === null) {
    return
  }

  chart = new Chart(element, {
    type: 'doughnut',
    data: {
      labels: props.positions.map((entry) => entry.label),
      datasets: [
        {
          data: props.positions.map((entry) => entry.count),
          backgroundColor: props.positions.map(
            (_, index) => positionColors[index % positionColors.length],
          ),
          borderColor: props.positions.map(
            (_, index) => positionColorsTransparent[index % positionColors.length],
          ),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: props.title,
          color: '#ffffff',
          font: {
            family: 'Outfit',
            size: 14,
            weight: 600,
          },
        },
        legend: {
          labels: {
            color: '#94a3b8',
            font: {
              family: 'Inter',
            },
          },
        },
      },
    },
  })
})

onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <div class="bg-mahjong-surface rounded-xl border border-mahjong-border p-4">
    <canvas ref="canvas" role="img" :aria-label="title"></canvas>
  </div>
</template>
