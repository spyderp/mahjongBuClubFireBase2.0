<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import BaseSnackbar from '@/components/ui/BaseSnackbar.vue'
import { appNotice } from '@/app/queryCache'

const { t } = useI18n()

/** En desarrollo el aviso añade el motivo real del fallo: sin él no se distingue un índice. */
const noticeText = computed(() => {
  const notice = appNotice.value

  if (notice === null) {
    return ''
  }

  const translated = t(notice.message)

  return notice.detail === '' ? translated : `${translated} — ${notice.detail}`
})
</script>

<template>
  <RouterView />

  <div
    v-if="appNotice !== null"
    class="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4"
  >
    <div class="pointer-events-auto w-full max-w-xl">
      <BaseSnackbar :message="noticeText" type="error" @dismiss="appNotice = null" />
    </div>
  </div>
</template>
