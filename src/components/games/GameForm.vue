<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/components/ui/BaseSelect.vue'
import { useGames } from '@/composables/useGames'
import { usePlayers } from '@/composables/usePlayers'
import { useSeasons } from '@/composables/useSeasons'
import { playersRepository } from '@/data/players.repository'
import { validateExternalId, validatePlayerName } from '@/domain/types'
import type { PlayerId, Timestamp as DomainTimestamp } from '@/domain/types'
import type { GameRecord, CreateGameInput } from '@/data/games.repository'

/** Mesa fija de Riichi: 25000 puntos de salida (RF-2.1) y reglas por defecto sin captura parcial. */
const START_POINTS = 25000
const DEFAULT_RULESET = { ruleset: 'mahjongSouls', rulesetVersion: '1.0' } as const

const SEATS = ['east', 'south', 'west', 'north'] as const

/**
 * RF-1.3 y RF-2.3: valor centinela de los asientos que se capturan como invitado. No puede
 * colisionar con un `playerId` real porque Firestore genera identificadores ownumericos.
 */
const GUEST_SEAT = '__guest__'

type GuestDraft = { name: string; externalId: string }

function emptyGuest(): GuestDraft {
  return { name: '', externalId: '' }
}

const emit = defineEmits<{
  saved: [game: GameRecord]
  cancel: []
}>()

const { t } = useI18n()
const { data: players } = usePlayers()
const { openGames, createGame } = useGames()
const { data: seasons } = useSeasons()

const date = ref('')
const length = ref('')
const seatPlayer = reactive<Record<(typeof SEATS)[number], string>>({
  east: '',
  south: '',
  west: '',
  north: '',
})
const guestDraft = reactive<Record<(typeof SEATS)[number], GuestDraft>>({
  east: emptyGuest(),
  south: emptyGuest(),
  west: emptyGuest(),
  north: emptyGuest(),
})

const errors = reactive<{
  date: string | null
  length: string | null
  seats: string | null
  save: string | null
  guests: string | null
}>({
  date: null,
  length: null,
  seats: null,
  save: null,
  guests: null,
})

/**
 * RF-27.1: al crear una partida solo se ofrecen los jugadores **dados de alta**. Un jugador retirado
 * no puede sentarse, así que no se lista; el invitado cierra la lista, como siempre (RF-1.3).
 *
 * Esto no rompe RF-2.9 de 001 —repetir jugador entre partidas abiertas—: ese caso trata de jugadores
 * activos que ya están en otro tablero, y siguen apareciendo. Aquí solo se excluye a quien está de
 * baja, que tampoco podría jugar la partida que se está creando.
 */
const playerOptions = computed<readonly SelectOption[]>(() => [
  ...(players.value ?? [])
    .filter((player) => player.active)
    .map((player) => ({ value: player.id, label: player.name })),
  { value: GUEST_SEAT, label: t('gamesView.guestOption') },
])

const lengthOptions = computed<readonly SelectOption[]>(() => [
  { value: 'tonpuusen', label: t('gamesView.tonpuusen') },
  { value: 'hanchan', label: t('gamesView.hanchan') },
])

/** RF-2.9: aviso no bloqueante si algún jugador ya está en otra partida abierta. */
const openGameNames = computed<readonly string[]>(() => {
  const selected = new Set(Object.values(seatPlayer).filter((id) => id.length > 0))
  const openPlayerIds = new Set(
    (openGames.data.value ?? []).flatMap((game) => game.players.map((p) => p.playerId)),
  )
  const names = (players.value ?? [])
    .filter((player) => selected.has(player.id) && openPlayerIds.has(player.id))
    .map((player) => player.name)

  return names
})

/** RF-11.4: el seasonId se deduce del rango de fechas del formulario, si la fecha cae en uno. */
const candidateSeason = computed(() => {
  if (date.value.length === 0) {
    return null
  }

  const seconds = new Date(`${date.value}T00:00:00`).getTime() / 1000

  return (
    (seasons.value ?? []).find(
      (season) => season.dateFrom.seconds <= seconds && seconds <= season.dateTo.seconds,
    ) ?? null
  )
})

function toTimestamp(date: string): DomainTimestamp {
  return { seconds: new Date(`${date}T00:00:00`).getTime() / 1000, nanoseconds: 0 }
}

async function handleSubmit(): Promise<void> {
  errors.save = null
  errors.date = date.value.length === 0 ? t('errors.game.dateRequired') : null
  errors.length = length.value.length === 0 ? t('errors.game.lengthRequired') : null

  /**
   * RF-1.3, RF-1.4, RF-1.5 y RF-2.3: un asiento marcado como invitado se resuelve por su
   * identificador normalizado. Si ese identificador ya existe —como invitado de otra partida o
   * como jugador del club— se reutiliza esa misma identidad, que es lo que hace que las
   * estadísticas se acumulen en vez de empezar de cero. Si no existe, nace un invitado.
   */
  const guestIdsBySeat = {} as Record<(typeof SEATS)[number], string>
  errors.guests = null

  const guestSeats = SEATS.filter((seat) => seatPlayer[seat] === GUEST_SEAT)

  if (guestSeats.length > 0) {
    const pending: { seat: (typeof SEATS)[number]; externalId: string; name: string }[] = []

    for (const seat of guestSeats) {
      const name = validatePlayerName(guestDraft[seat].name)
      if (!name.ok) {
        errors.guests = t(
          name.reason === 'empty' ? 'errors.player.nameEmpty' : 'errors.player.nameTooLong',
        )
        break
      }

      const externalId = validateExternalId(guestDraft[seat].externalId)
      if (!externalId.ok) {
        errors.guests = t('errors.player.externalIdInvalid')
        break
      }

      pending.push({ seat, externalId: externalId.externalId, name: name.name })
    }

    if (
      errors.guests === null &&
      new Set(pending.map((entry) => entry.externalId)).size !== pending.length
    ) {
      errors.guests = t('errors.game.guestSeatTaken')
    }

    if (errors.guests !== null) {
      return
    }

    for (const entry of pending) {
      const known = await playersRepository.findByExternalId(entry.externalId)
      const record =
        known ??
        (await playersRepository.create({
          externalId: entry.externalId,
          name: entry.name,
          guest: true,
        }))

      guestIdsBySeat[entry.seat] = record.id
    }
  }

  const participants = SEATS.map((seat) => ({
    seat,
    playerId: (guestIdsBySeat[seat] ?? seatPlayer[seat]) as PlayerId,
  }))
  const selectedIds = participants.filter((p) => p.playerId.length > 0).map((p) => p.playerId)

  if (participants.some((p) => p.playerId.length === 0) || new Set(selectedIds).size !== 4) {
    errors.seats =
      new Set(selectedIds).size !== selectedIds.length
        ? t('errors.game.duplicateSeat')
        : t('errors.game.seatsRequired')
  } else {
    errors.seats = null
  }

  if (errors.date !== null || errors.length !== null || errors.seats !== null) {
    return
  }

  if (candidateSeason.value !== null && candidateSeason.value.status === 'closed') {
    errors.date = t('errors.game.closedSeason', { title: candidateSeason.value.title })
    return
  }

  const input: CreateGameInput = {
    ...DEFAULT_RULESET,
    seasonId: candidateSeason.value?.id ?? null,
    date: toTimestamp(date.value),
    gameLength: length.value as 'tonpuusen' | 'hanchan',
    startPoints: START_POINTS,
    players: participants,
  }

  /**
   * El rechazo se captura y se pinta: sin esto, una escritura denegada por las reglas o caída por
   * falta de conexión devolvía una promesa rechazada que nadie pintaba, y un guardado fallido era
   * indistinguible de uno correcto. `emit('saved')` solo se emite cuando la escritura existe.
   */
  try {
    const game = await createGame.mutateAsync(input)
    emit('saved', game)
  } catch {
    errors.save = t('errors.game.saveFailed')
  }
}

function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="handleSubmit">
    <h2 class="text-lg font-semibold">
      {{ t('gamesView.newTitle') }}
    </h2>

    <label class="flex flex-col gap-1 text-sm">
      <span>{{ t('gamesView.date') }}</span>
      <BaseInput v-model="date" name="date" type="date" />
      <span v-if="errors.date !== null" class="text-xs text-mahjong-negative">
        {{ errors.date }}
      </span>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span>{{ t('gamesView.length') }}</span>
      <BaseSelect v-model="length" name="length" :options="lengthOptions" />
      <span v-if="errors.length !== null" class="text-xs text-mahjong-negative">
        {{ errors.length }}
      </span>
    </label>

    <fieldset class="grid grid-cols-2 gap-3">
      <legend class="sr-only">{{ t('gamesView.player') }}</legend>
      <label v-for="seat in SEATS" :key="seat" class="flex flex-col gap-1 text-sm">
        <span>{{ t(`gamesView.seats.${seat}`) }}</span>
        <BaseSelect v-model="seatPlayer[seat]" :name="`seat-${seat}`" :options="playerOptions" />
        <template v-if="seatPlayer[seat] === GUEST_SEAT">
          <input
            v-model="guestDraft[seat].name"
            class="rounded border border-mahjong-border px-2 py-1"
            :name="`guest-name-${seat}`"
            :placeholder="t('turnForm.guestName')"
          />
          <input
            v-model="guestDraft[seat].externalId"
            class="rounded border border-mahjong-border px-2 py-1"
            :name="`guest-external-id-${seat}`"
            :placeholder="t('turnForm.guestExternalId')"
          />
        </template>
      </label>
      <span
        v-if="errors.guests !== null"
        class="col-span-2 text-xs text-mahjong-negative"
        data-test="guest-error"
      >
        {{ errors.guests }}
      </span>
      <span v-if="errors.seats !== null" class="col-span-2 text-xs text-mahjong-negative">
        {{ errors.seats }}
      </span>
    </fieldset>

    <div v-if="openGameNames.length > 0" class="text-xs text-mahjong-warning">
      <span>{{ t('gamesView.openWarnings') }} {{ openGameNames.join(', ') }}</span>
    </div>

    <p
      v-if="errors.save !== null"
      role="alert"
      class="text-sm text-mahjong-negative"
      data-test="save-error"
    >
      {{ errors.save }}
    </p>

    <div class="flex gap-2">
      <BaseButton type="button" variant="ghost" @click="handleCancel">
        {{ t('common.cancel') }}
      </BaseButton>
      <BaseButton type="submit" :disabled="createGame.isLoading.value">
        {{ t('gamesView.submit') }}
      </BaseButton>
    </div>
  </form>
</template>
