<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { RouterLink } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'

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
</script>

<template>
  <nav class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
    <RouterLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="text-mahjong-muted hover:text-mahjong-text"
    >
      {{ link.label }}
    </RouterLink>

    <template v-if="session.status === 'authenticated'">
      <span aria-hidden="true" class="text-mahjong-border">·</span>

      <RouterLink to="/partidas/nueva">
        <BaseButton variant="success" size="sm">
          {{ t('nav.newGame') }}
        </BaseButton>
      </RouterLink>
      <RouterLink to="/jugadores/nuevo">
        <BaseButton variant="info" size="sm">
          {{ t('nav.newPlayer') }}
        </BaseButton>
      </RouterLink>
      <RouterLink to="/temporadas/nueva">
        <BaseButton variant="warning" size="sm">
          {{ t('nav.newSeason') }}
        </BaseButton>
      </RouterLink>
    </template>
  </nav>
</template>
