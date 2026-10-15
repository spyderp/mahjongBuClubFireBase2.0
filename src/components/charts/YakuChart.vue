<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Chart from 'chart.js/auto'
import { chartColorOf } from '@/styles/palette'

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
          backgroundColor: chartColorOf(0),
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        title: { display: true, text: props.title },
        legend: { display: false },
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
