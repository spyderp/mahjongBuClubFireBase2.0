<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { t } = useI18n()

/** Enlaces de navegación generales (siempre visibles). Los valores son `camelCase` (AGENT.md). */
const links: readonly { to: string; label: string }[] = [
  { to: '/', label: t('nav.dashboard') },
  { to: '/partidas', label: t('nav.games') },
  { to: '/jugadores', label: t('nav.players') },
  { to: '/temporadas', label: t('nav.seasons') },
  { to: '/estadisticas', label: t('nav.stats') },
  { to: '/ranking', label: t('nav.rankings') },
]

/** RF-14.4: las acciones de captura solo existen con sesión autenticada. */
const captureLinks: readonly { to: string; label: string }[] = [
  { to: '/partidas/nueva', label: t('nav.newGame') },
  { to: '/jugadores/nuevo', label: t('nav.newPlayer') },
  { to: '/temporadas/nueva', label: t('nav.newSeason') },
]
</script>

<template>
  <nav class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
    <RouterLink v-for="link in links" :key="link.to" :to="link.to">
      {{ link.label }}
    </RouterLink>

    <template v-if="session.status === 'authenticated'">
      <span aria-hidden="true" class="text-mahjong-border">·</span>
      <RouterLink
        v-for="capture in captureLinks"
        :key="capture.to"
        :to="capture.to"
        class="text-mahjong-accent"
      >
        {{ capture.label }}
      </RouterLink>
    </template>
  </nav>
</template>
