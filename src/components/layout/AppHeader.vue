<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppNav from '@/components/layout/AppNav.vue'
import { useSessionStore } from '@/stores/session'
import BaseButton from '@/components/ui/BaseButton.vue'

const session = useSessionStore()
const { t } = useI18n()

/** RF-15.x: muestra solo datos accesibles; nunca correo, UID ni credenciales. */
function handleSignOut(): void {
  void session.signOut().catch(() => undefined)
}
</script>

<template>
  <header class="border-b border-mahjong-border bg-mahjong-surface/80 backdrop-blur-md">
    <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
      <RouterLink
        to="/"
        class="font-display text-base font-semibold tracking-tight text-mahjong-text"
      >
        {{ t('app.title') }}
      </RouterLink>

      <AppNav />

      <div v-if="session.status === 'authenticated'" class="flex items-center gap-3 text-sm">
        <span class="text-mahjong-muted">{{
          session.user?.displayName ?? t('session.signedIn')
        }}</span>
        <BaseButton variant="ghost" size="sm" @click="handleSignOut">
          {{ t('nav.signOut') }}
        </BaseButton>
      </div>
      <RouterLink v-else-if="session.status === 'anonymous'" to="/sesion" class="text-sm">
        {{ t('nav.signIn') }}
      </RouterLink>
    </div>
  </header>
</template>
