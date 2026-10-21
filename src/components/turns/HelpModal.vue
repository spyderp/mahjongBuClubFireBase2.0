<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import ayuda from '@/docs/ayuda-turnos.md?raw'

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

/**
 * RF-28.1 y RF-28.2: la ayuda se pinta desde **un único documento markdown del repositorio**,
 * importado con `?raw` en tiempo de compilación. No hay una plantilla duplicada: el texto que se ve
 * es el del fichero, y el test de RF-28.3 lo comprueba contra el disco para que no pueda driftar.
 */
const contenido = ayuda
</script>

<template>
  <BaseDialog :open="open" :title="t('turnForm.help.title')" @close="emit('close')">
    <pre class="whitespace-pre-wrap text-sm text-mahjong-muted" data-test="help-content">{{
      contenido
    }}</pre>
  </BaseDialog>
</template>
