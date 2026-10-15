<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useSessionStore } from '@/stores/session'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const email = ref('')
const password = ref('')
const failure = ref('')

/**
 * T100 · RF-14.3 y RNF-7: el fallo de acceso se muestra con un mensaje único y sin decir si la
 * cuenta existe. `AuthError.message` ya es la clave i18n (`errors.auth.*`), que es lo único que
 * se pinta; el texto del SDK nunca llega a la interfaz.
 */
const errorKey = computed(() => (failure.value === '' ? null : failure.value))

/** Rutas internas válidas: solo las que empiezan por `/` y no por `//` ni por un esquema. */
function redirectTarget(): string {
  const value = route.query['redirect']

  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/'
  }

  return value
}

async function goBack(): Promise<void> {
  await router.push(redirectTarget())
}

/** T101 · RF-15.3: tras entrar se vuelve a la acción que el guard interrumpió. */
watch(
  () => session.status,
  (status, previous) => {
    if (previous !== 'authenticated' && status === 'authenticated') {
      void goBack()
    }
  },
  { immediate: true },
)

async function handleSubmit(): Promise<void> {
  if (session.pending) {
    return
  }

  failure.value = ''

  try {
    await session.signIn(email.value, password.value)
  } catch (caught: unknown) {
    failure.value = caught instanceof Error ? caught.message : 'errors.auth.unknown'
  }
}
</script>

<template>
  <section class="max-w-xl">
    <h1 class="text-xl font-semibold">
      {{ t('loginView.title') }}
    </h1>

    <p class="mt-2 text-mahjong-text">
      {{ t('loginView.description') }}
    </p>

    <form class="mt-4 flex flex-col gap-3" @submit.prevent="handleSubmit">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('loginView.email') }}</span>
        <BaseInput
          v-model="email"
          name="email"
          type="email"
          autocomplete="email"
          :disabled="session.pending"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('loginView.password') }}</span>
        <BaseInput
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          :disabled="session.pending"
        />
      </label>

      <p v-if="errorKey !== null" role="alert" class="text-sm text-mahjong-negative">
        {{ t(errorKey) }}
      </p>

      <div class="flex items-center gap-3">
        <BaseButton type="submit" :disabled="session.pending">
          {{ session.pending ? t('loginView.submitting') : t('loginView.submit') }}
        </BaseButton>

        <RouterLink to="/partidas" class="text-sm text-mahjong-accent">
          {{ t('loginView.backToGames') }}
        </RouterLink>
      </div>
    </form>

    <p class="mt-4 text-sm text-mahjong-muted">
      {{ t('loginView.howItWorks') }}
    </p>
  </section>
</template>
