<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'chart.js/auto'
import { chartColorOf } from '@/styles/palette'

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
          backgroundColor: props.positions.map((_, index) => chartColorOf(index)),
        },
      ],
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
