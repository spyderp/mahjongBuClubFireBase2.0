<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'chart.js/auto'
import { chartPalette } from '@/styles/palette'

export interface YakuCount {
  readonly label: string
  readonly count: number
}

const props = defineProps<{
  title: string
  yaku: readonly YakuCount[]
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

const yakuBarColor = hexToRgb(chartPalette[1] ?? '#10b981') // mahjong-green
const yakuBarColorTransparent = hexToRgba(chartPalette[1] ?? '#10b981', 0.2)

onMounted(() => {
  const element = canvas.value
  if (element === null) {
    return
  }

  chart = new Chart(element, {
    type: 'bar',
    data: {
      labels: props.yaku.map((entry) => entry.label),
      datasets: [
        {
          data: props.yaku.map((entry) => entry.count),
          backgroundColor: yakuBarColor,
          borderColor: yakuBarColorTransparent,
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: 'y',
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
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgb(31 41 55)' },
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { display: false },
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
