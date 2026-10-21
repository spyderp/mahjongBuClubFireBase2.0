<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import tabla from '@/assets/tabla-puntuacion.png'

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

/**
 * RF-28.4: la tabla de puntuación se muestra como la **imagen que aporta el club**. La ruta está
 * declarada en `spec.md` §8 y este import hace que borrarla o moverla rompa el build. Es una
 * instantánea: su contenido no puede comprobarse contra `docs/domain.md` §4.2.
 */
const imagen = tabla
</script>

<template>
  <BaseDialog
    :open="open"
    :title="t('turnForm.scoreTable.title')"
    max-width="max-w-3xl"
    @close="emit('close')"
  >
    <img :src="imagen" :alt="t('turnForm.scoreTable.alt')" class="w-full" />
  </BaseDialog>
</template>
