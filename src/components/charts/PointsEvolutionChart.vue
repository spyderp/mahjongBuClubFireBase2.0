<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'chart.js/auto'
import { chartColorOf } from '@/styles/palette'

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
        borderColor: chartColorOf(index),
        backgroundColor: chartColorOf(index),
        tension: 0.2,
      })),
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: props.title },
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
  <div>
    <canvas ref="canvas" role="img" :aria-label="title"></canvas>
  </div>
</template>
