<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PlayerForm from '@/components/players/PlayerForm.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import { usePlayers } from '@/composables/usePlayers'
import type { PlayerId } from '@/domain/types'

defineProps<{ creating?: boolean }>()

const { t } = useI18n()
const router = useRouter()
const { data: players, updatePlayer } = usePlayers()

const retireTarget = ref<{ id: PlayerId; name: string } | null>(null)

async function handleSaved(): Promise<void> {
  await router.push('/jugadores')
}

function handleCancel(): void {
  void router.push('/jugadores')
}

async function confirmRetire(): Promise<void> {
  if (retireTarget.value === null) {
    return
  }

  await updatePlayer.mutateAsync({ id: retireTarget.value.id, patch: { active: false } })
  retireTarget.value = null
}
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-xl font-semibold">
        {{ t(creating ? 'playersView.newTitle' : 'playersView.title') }}
      </h1>
      <RouterLink v-if="!creating" to="/jugadores/nuevo">
        <BaseButton variant="info">
          {{ t('nav.newPlayer') }}
        </BaseButton>
      </RouterLink>
    </div>

    <template v-if="creating">
      <PlayerForm @saved="handleSaved" @cancel="handleCancel" />
    </template>

    <template v-else>
      <div
        v-if="(players ?? []).length === 0"
        class="rounded border border-mahjong-border bg-mahjong-surface p-4 text-sm text-mahjong-muted"
      >
        {{ t('playersView.noPlayers') }}
      </div>

      <ul
        v-else
        class="divide-y divide-mahjong-border rounded border border-mahjong-border bg-mahjong-surface"
      >
        <li
          v-for="player in players ?? []"
          :key="player.id"
          class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        >
          <div>
            <p class="font-medium">
              {{ player.name }}
            </p>
            <p class="text-sm text-mahjong-muted">
              {{ player.externalId }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <span
              :class="[
                'rounded-full px-3 py-1 text-sm',
                player.active
                  ? 'bg-mahjong-positive/10 text-mahjong-positive'
                  : 'bg-mahjong-border/40 text-mahjong-muted',
              ]"
            >
              {{ t(player.active ? 'playersView.active' : 'playersView.retired') }}
            </span>
            <BaseButton
              v-if="player.active"
              variant="danger"
              size="sm"
              @click="retireTarget = { id: player.id, name: player.name }"
            >
              {{ t('playersView.retire') }}
            </BaseButton>
          </div>
        </li>
      </ul>

      <BaseDialog
        :open="retireTarget !== null"
        :title="t('playersView.confirmRetire', { name: retireTarget?.name ?? '' })"
        @close="retireTarget = null"
      >
        <p class="mb-4 text-sm text-mahjong-muted">{{ t('playersView.confirmRetireHint') }}</p>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" @click="retireTarget = null">
            {{ t('playersView.cancel') }}
          </BaseButton>
          <BaseButton variant="danger" @click="confirmRetire">
            {{ t('playersView.confirm') }}
          </BaseButton>
        </div>
      </BaseDialog>
    </template>
  </section>
</template>
