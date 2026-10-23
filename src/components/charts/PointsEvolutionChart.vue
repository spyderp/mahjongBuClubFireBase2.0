<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'chart.js/auto'
import { chartPalette } from '@/styles/palette'

export interface PointsSeries {
  readonly label: string
  readonly points: readonly number[]
}

const props = defineProps<{
  title: string
  series: readonly PointsSeries[]
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

const themeColors = chartPalette.map(hexToRgb)
const themeColorsTransparent = chartPalette.map((hex) => hexToRgba(hex, 0.2))

onMounted(() => {
  const element = canvas.value
  if (element === null) {
    return
  }

  chart = new Chart(element, {
    type: 'line',
    data: {
      labels: props.series[0]?.points.map((_, index) => index + 1) ?? [],
      datasets: props.series.map((series, index) => ({
        label: series.label,
        data: [...series.points],
        borderColor: themeColors[index % themeColors.length],
        backgroundColor: themeColorsTransparent[index % themeColors.length],
        tension: 0.2,
        fill: true,
      })),
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
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgb(31 41 55)' },
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgb(31 41 55)' },
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
