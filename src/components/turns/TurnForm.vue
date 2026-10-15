<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/components/ui/BaseSelect.vue'
import BaseSnackbar from '@/components/ui/BaseSnackbar.vue'
import { useGameTurns } from '@/composables/useGameTurns'
import type { TurnDraft } from '@/composables/useGameTurns'
import { DataError } from '@/data/errors'
import type { CreateTurnInput, TurnRecord } from '@/data/turns.repository'
import { validateRepresentable } from '@/domain/handValue'
import type { HandResultType } from '@/domain/handValue'
import { isRenchan, minTurns } from '@/domain/rules'
import { checkSquare, resolveTurn } from '@/domain/turn'
import type { TurnPlayer, TurnResolution } from '@/domain/turn'
import type { PlayerId, ResultType, Seat, Wind } from '@/domain/types'
import { validateChiitoitsuFu, validateWindYaku, validateYakuPresence } from '@/domain/yaku'
import { YAKU_CATALOG } from '@/domain/yaku'
import type { YakuId } from '@/domain/yaku'
import type { GameRecord } from '@/data/games.repository'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{
  game: GameRecord
}>()

const emit = defineEmits<{
  saved: [turn: TurnRecord]
  cancel: []
}>()

const { t } = useI18n()
const session = useSessionStore()
const { data: turns, registerTurn, saveDraft, loadDraft, clearDraft } = useGameTurns(props.game.id)

const table = computed(() =>
  props.game.players.map((participant) => ({
    playerId: participant.playerId,
    seat: participant.seat as Seat,
  })),
)

/** Marcador actual de cada jugador: salida + deltas acumulados de los turnos guardados. */
const scores = computed<ReadonlyMap<PlayerId, number>>(() => {
  const next = new Map<PlayerId, number>(
    table.value.map((player) => [player.playerId, props.game.startPoints]),
  )

  for (const turn of turns.value ?? []) {
    for (const delta of turn.deltas) {
      next.set(delta.playerId, (next.get(delta.playerId) ?? 0) + delta.delta)
    }
  }

  return next
})

const turnNo = computed(() => (turns.value?.length ?? 0) + 1)
const riichiSticksBefore = computed(() => turns.value?.at(-1)?.riichiSticks ?? 0)

const resultType = ref<ResultType | ''>('')
const dealerId = ref<PlayerId | ''>('')
const wind = ref<Wind>('east')
const honba = ref('0')
const winnerId = ref<PlayerId | ''>('')
const discarderId = ref<PlayerId | ''>('')
const selectedYaku = ref<YakuId[]>([])
const yakuHan = ref('0')
const doraCount = ref('0')
const fu = ref('20')
const tenpai = ref<PlayerId[]>([])
const chomboId = ref<PlayerId | ''>('')
const riichiPlayers = ref<PlayerId[]>([])

const errors = reactive<{ field: string | null; global: string | null }>({
  field: null,
  global: null,
})

const players = computed<readonly TurnPlayer[]>(() =>
  table.value.map((player) => ({
    playerId: player.playerId,
    seat: player.seat,
    score: scores.value.get(player.playerId) ?? props.game.startPoints,
  })),
)

const playerOptions = computed<readonly SelectOption[]>(() =>
  table.value.map((player) => ({
    value: player.playerId,
    label: t(`gamesView.seats.${player.seat}`),
  })),
)

const resultTypeOptions = computed<readonly SelectOption[]>(() =>
  (['tsumo', 'ron', 'ryuukyoku', 'chombo'] as const).map((type) => ({
    value: type,
    label: t(`turnForm.resultTypes.${type}`),
  })),
)

const windOptions = computed<readonly SelectOption[]>(() =>
  (['east', 'south', 'west', 'north'] as const).map((value) => ({
    value,
    label: t(`gamesView.seats.${value}`),
  })),
)

/** Lista de yaku disponible con su nombre; el valor real sale del motor (RF-4.x). */
const yakuOptions = computed<readonly SelectOption[]>(() =>
  YAKU_CATALOG.map((definition) => ({ value: definition.id, label: t(`yaku.${definition.id}`) })),
)

const isWin = computed(() => resultType.value === 'tsumo' || resultType.value === 'ron')
const isDraw = computed(() => resultType.value === 'ryuukyoku')
const isChombo = computed(() => resultType.value === 'chombo')

/** Punto de retorno del reglamento: superarlo avisa, no cierra (desviación nº 2 de `docs/domain.md`). */
const RETURN_POINT = 30000

/** RF-4.7: alguien por debajo de cero significa que la partida ya no puede continuar. */
const bankruptSeats = computed<readonly string[]>(() =>
  table.value
    .filter((player) => (scores.value.get(player.playerId) ?? props.game.startPoints) < 0)
    .map((player) => t(`gamesView.seats.${player.seat}`)),
)

/** RF-8.7: superar el punto de retorno se avisa, pero no impide capturar ni prorroga. */
const overReturnPoint = computed(() =>
  table.value.some(
    (player) => (scores.value.get(player.playerId) ?? props.game.startPoints) > RETURN_POINT,
  ),
)

function isNonNegativeInteger(raw: string): boolean {
  return /^\d+$/u.test(raw.trim())
}

/**
 * RF-3.13: un turno con resultado de mano exige yaku, han de yaku, dora, fu y honba. Antes no se
 * comprobaba nada de esto y `Number('')` es `0`, así que un campo borrado se guardaba como cero
 * en silencio. Sin estos cinco datos no hay mano que luego se pueda recalcular ni contrastar.
 */
function handFieldsComplete(): boolean {
  return (
    selectedYaku.value.length > 0 &&
    isNonNegativeInteger(yakuHan.value) &&
    isNonNegativeInteger(doraCount.value) &&
    isNonNegativeInteger(fu.value) &&
    isNonNegativeInteger(honba.value)
  )
}

function toggleIn(list: PlayerId[], playerId: PlayerId): void {
  const index = list.indexOf(playerId)

  if (index >= 0) {
    list.splice(index, 1)
  } else {
    list.push(playerId)
  }
}

function toggleYaku(id: YakuId): void {
  const index = selectedYaku.value.indexOf(id)

  if (index >= 0) {
    selectedYaku.value.splice(index, 1)
  } else {
    selectedYaku.value.push(id)
  }
}

const playerLabel = (seat: Seat): string => t(`gamesView.seats.${seat}`)

/**
 * T104 · RF-4.1: las fichas reclamadas en este turno son las que había en la mesa **más** las que
 * se declaran ahora. Comparar solo con el bote previo pedía −1000 en un turno que cuadra a cero
 * —cuando el declarante es quien gana, su ficha vuelve con el bote— y rechazaba la captura.
 */
function riichiSticksClaimedThisTurn(): number {
  return isWin.value ? riichiSticksBefore.value + riichiPlayers.value.length : 0
}

async function handleSubmit(): Promise<void> {
  errors.field = null
  errors.global = null

  if (resultType.value === '') {
    errors.field = 'resultRequired'
    return
  }

  if (props.game.ruleset === 'mleague') {
    errors.global = 'rulesetUnsupported'
    return
  }

  if (session.user === null) {
    errors.global = 'sessionRequired'
    return
  }

  if (dealerId.value === '') {
    errors.field = 'resultRequired'
    return
  }

  const base = {
    players: players.value,
    dealerId: dealerId.value as PlayerId,
    honba: Number(honba.value),
    riichiDeclaredBy: [...riichiPlayers.value],
    riichiSticksBefore: riichiSticksBefore.value,
  }

  let resolution: ReturnType<typeof resolveTurn> | null = null

  if (isWin.value) {
    if (winnerId.value === '') {
      errors.field = 'resultRequired'
      return
    }

    if (resultType.value === 'ron' && discarderId.value === '') {
      errors.field = 'resultRequired'
      return
    }

    if (
      !validateYakuPresence({ yakuHan: Number(yakuHan.value), doraCount: Number(doraCount.value) })
        .ok
    ) {
      errors.field = 'noYaku'
      return
    }

    /** RF-3.13, después de RF-4.3: `noYaku` explica mejor el caso sin yaku real que este aviso. */
    if (!handFieldsComplete()) {
      errors.field = 'handFieldsRequired'
      return
    }

    const winnerSeat = table.value.find((player) => player.playerId === winnerId.value)
    if (winnerSeat === undefined) {
      errors.field = 'resultRequired'
      return
    }

    const windCheck = validateWindYaku(selectedYaku.value, {
      seat: winnerSeat.seat,
      roundWind: wind.value,
    })

    if (!windCheck.ok) {
      errors.field = 'windYaku'
      return
    }

    const hasChiitoitsu = selectedYaku.value.includes('chiitoitsu')
    const fuCheck = validateChiitoitsuFu(Number(fu.value), hasChiitoitsu)

    if (!fuCheck.ok) {
      errors.field = 'chiiFu'
      return
    }

    const totalHan = Number(yakuHan.value) + Number(doraCount.value)
    const representable = validateRepresentable({
      han: totalHan,
      fu: Number(fu.value),
      resultType: resultType.value as HandResultType,
    })

    if (!representable.ok) {
      errors.field = 'notRepresentable'
      return
    }

    const handInput = {
      yaku: selectedYaku.value,
      yakuHan: Number(yakuHan.value),
      doraCount: Number(doraCount.value),
      fu: Number(fu.value),
    }

    const turnInput =
      resultType.value === 'ron'
        ? {
            ...base,
            resultType: 'ron' as const,
            winners: [{ playerId: winnerId.value, hand: handInput }],
            discarderId: discarderId.value as PlayerId,
          }
        : {
            ...base,
            resultType: 'tsumo' as const,
            winners: [{ playerId: winnerId.value, hand: handInput }],
          }

    const outcome = resolveTurn(turnInput)

    if (!outcome.ok) {
      errors.field = 'moreThanThreeWinners'
      return
    }

    resolution = outcome
  } else if (isDraw.value) {
    if (tenpai.value.length === 0) {
      errors.field = 'tenpaiRequired'
      return
    }

    const outcome = resolveTurn({
      ...base,
      resultType: 'ryuukyoku',
      tenpai: [...tenpai.value],
    })

    if (!outcome.ok) {
      errors.field = 'moreThanThreeWinners'
      return
    }

    resolution = outcome
  } else {
    if (chomboId.value === '') {
      errors.field = 'resultRequired'
      return
    }

    const outcome = resolveTurn({ ...base, resultType: 'chombo', chomboId: chomboId.value })

    resolution = outcome.ok ? outcome : null
  }

  if (
    resolution !== null &&
    !checkSquare({
      deltas: resolution.resolution.deltas,
      riichiDeclared: riichiPlayers.value.length,
      riichiSticksClaimedThisTurn: riichiSticksClaimedThisTurn(),
      chombos: isChombo.value ? 1 : 0,
    }).ok
  ) {
    errors.field = 'notSquare'
    return
  }

  if (resolution !== null) {
    await persist(resolution.resolution)
  }
}

async function persist(resolution: TurnResolution): Promise<void> {
  const capturedBy = session.user?.id ?? ''
  const dealerIsEast =
    table.value.find((player) => player.playerId === dealerId.value)?.seat === 'east'

  const input: CreateTurnInput = {
    turnNo: turnNo.value,
    wind: wind.value as Wind,
    dealerId: dealerId.value as PlayerId,
    honba: Number(honba.value),
    resultType: resultType.value as ResultType,
    yaku: isWin.value ? selectedYaku.value : [],
    yakuHan: isWin.value ? Number(yakuHan.value) : 0,
    doraCount: isWin.value ? Number(doraCount.value) : 0,
    fu: isWin.value ? Number(fu.value) : 0,
    tenpai: isDraw.value ? [...tenpai.value] : [],
    riichiDeclaredBy: [...riichiPlayers.value],
    riichiSticks: resolution.riichiSticks,
    value: resolution.values,
    deltas: resolution.deltas,
    capturedBy,
    isRenchan: isRenchan(
      isWin.value
        ? dealerIsEast
          ? { type: 'dealerWin' }
          : { type: 'otherWin' }
        : isDraw.value && tenpai.value.includes(dealerId.value as PlayerId)
          ? { type: 'dealerTenpaiDraw' }
          : { type: 'otherDraw' },
    ),
    isFinalTurn: turnNo.value >= minTurns(props.game.gameLength),
  }

  try {
    const saved = await registerTurn.mutateAsync(input)
    clearDraft()
    emit('saved', saved)
  } catch (caught: unknown) {
    if (caught instanceof DataError) {
      errors.global =
        caught.code === 'duplicateNumber'
          ? 'duplicateNumber'
          : caught.code === 'gapInSequence'
            ? 'gapInSequence'
            : 'resultRequired'
    }
  }
}

/** RF-15.8: el borrador se guarda con cada cambio y se restaura al montar. */
function draftOf(): TurnDraft {
  return {
    resultType: resultType.value,
    dealerId: dealerId.value,
    wind: wind.value,
    honba: honba.value,
    winnerId: winnerId.value,
    discarderId: discarderId.value,
    selectedYaku: [...selectedYaku.value],
    yakuHan: yakuHan.value,
    doraCount: doraCount.value,
    fu: fu.value,
    tenpai: [...tenpai.value],
    chomboId: chomboId.value,
    riichiPlayers: [...riichiPlayers.value],
  }
}

let restoring = true

function restoreDraft(): void {
  const draft = loadDraft()

  if (draft === null) {
    return
  }

  if (typeof draft.resultType === 'string') {
    resultType.value = draft.resultType as ResultType
  }
  if (typeof draft.dealerId === 'string') {
    dealerId.value = draft.dealerId as PlayerId
  }
  if (typeof draft.wind === 'string') {
    wind.value = draft.wind as Wind
  }
  if (typeof draft.honba === 'string') {
    honba.value = draft.honba
  }
  if (typeof draft.winnerId === 'string') {
    winnerId.value = draft.winnerId as PlayerId
  }
  if (typeof draft.discarderId === 'string') {
    discarderId.value = draft.discarderId as PlayerId
  }
  if (Array.isArray(draft.selectedYaku)) {
    selectedYaku.value = draft.selectedYaku.filter((id): id is YakuId => typeof id === 'string')
  }
  if (typeof draft.yakuHan === 'string') {
    yakuHan.value = draft.yakuHan
  }
  if (typeof draft.doraCount === 'string') {
    doraCount.value = draft.doraCount
  }
  if (typeof draft.fu === 'string') {
    fu.value = draft.fu
  }
  if (Array.isArray(draft.tenpai)) {
    tenpai.value = draft.tenpai.filter((id): id is PlayerId => typeof id === 'string')
  }
  if (typeof draft.chomboId === 'string') {
    chomboId.value = draft.chomboId as PlayerId
  }
  if (Array.isArray(draft.riichiPlayers)) {
    riichiPlayers.value = draft.riichiPlayers.filter((id): id is PlayerId => typeof id === 'string')
  }
}

watch(
  draftOf,
  (draft) => {
    if (!restoring) {
      saveDraft(draft)
    }
  },
  { deep: true },
)

onMounted(() => {
  restoreDraft()
  restoring = false
})

function handleCancel(): void {
  emit('cancel')
}

function labelOf(playerId: PlayerId): string {
  const seat = table.value.find((player) => player.playerId === playerId)?.seat
  return seat === undefined ? '' : playerLabel(seat)
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="handleSubmit">
    <h2 class="text-lg font-semibold">
      {{ t('turnForm.title') }}
    </h2>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.resultType') }}</span>
        <BaseSelect v-model="resultType" name="resultType" :options="resultTypeOptions" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.dealerSeat') }}</span>
        <BaseSelect v-model="dealerId" name="dealerId" :options="playerOptions" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.roundWind') }}</span>
        <BaseSelect v-model="wind" name="wind" :options="windOptions" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.honba') }}</span>
        <BaseInput v-model="honba" name="honba" type="number" />
      </label>
    </div>

    <fieldset class="flex flex-col gap-1 text-sm">
      <legend class="text-mahjong-muted">{{ t('turnForm.riichi') }}</legend>
      <label v-for="player in players" :key="player.playerId" class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="riichiPlayers.includes(player.playerId)"
          @change="toggleIn(riichiPlayers, player.playerId)"
        />
        <span>{{ labelOf(player.playerId) }}</span>
      </label>
    </fieldset>

    <template v-if="isWin">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.winner') }}</span>
        <BaseSelect v-model="winnerId" name="winnerId" :options="playerOptions" />
      </label>

      <label v-if="resultType === 'ron'" class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.discarder') }}</span>
        <BaseSelect v-model="discarderId" name="discarderId" :options="playerOptions" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.yakuHan') }}</span>
        <BaseInput v-model="yakuHan" name="yakuHan" type="number" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.dora') }}</span>
        <BaseInput v-model="doraCount" name="doraCount" type="number" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.fu') }}</span>
        <BaseInput v-model="fu" name="fu" type="number" />
      </label>

      <fieldset class="flex flex-col gap-1 text-sm">
        <legend class="text-mahjong-muted">{{ t('turnForm.yaku') }}</legend>
        <label
          v-for="option in yakuOptions"
          :key="option.value"
          class="flex items-center gap-2 text-xs"
        >
          <input
            type="checkbox"
            :checked="selectedYaku.includes(option.value as YakuId)"
            :value="option.value"
            @change="toggleYaku(option.value as YakuId)"
          />
          <span>{{ option.label }}</span>
        </label>
      </fieldset>
    </template>

    <fieldset v-else-if="isDraw" class="flex flex-col gap-1 text-sm">
      <legend class="text-mahjong-muted">{{ t('turnForm.tenpai') }}</legend>
      <label v-for="player in players" :key="player.playerId" class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="tenpai.includes(player.playerId)"
          @change="toggleIn(tenpai, player.playerId)"
        />
        <span>{{ labelOf(player.playerId) }}</span>
      </label>
    </fieldset>

    <label v-else-if="isChombo" class="flex flex-col gap-1 text-sm">
      <span>{{ t('turnForm.resultTypes.chombo') }}</span>
      <BaseSelect v-model="chomboId" name="chomboId" :options="playerOptions" />
    </label>

    <span v-if="errors.field !== null" class="text-xs text-mahjong-negative">
      {{ t(`errors.turn.${errors.field}`) }}
    </span>

    <p class="text-xs text-mahjong-muted" data-test="impossible-yaku-notice">
      {{ t('turnForm.impossibleYakuNotice') }}
    </p>

    <p
      v-if="bankruptSeats.length > 0"
      class="text-xs text-mahjong-negative"
      data-test="bankrupt-notice"
    >
      {{ t('turnForm.bankruptNotice') }} {{ bankruptSeats.join(', ') }}
    </p>

    <p v-if="overReturnPoint" class="text-xs text-mahjong-warning" data-test="return-point-notice">
      {{ t('turnForm.returnPointNotice') }}
    </p>

    <div class="flex gap-2">
      <BaseButton type="button" variant="ghost" @click="handleCancel">
        {{ t('common.cancel') }}
      </BaseButton>
      <BaseButton type="submit" :disabled="registerTurn.isLoading.value">
        {{ t('turnForm.submit') }}
      </BaseButton>
    </div>

    <BaseSnackbar
      v-if="errors.global === 'sessionRequired'"
      :message="t('errors.session.required')"
      type="info"
      @dismiss="errors.global = null"
    />
    <BaseSnackbar
      v-else-if="errors.global === 'rulesetUnsupported'"
      :message="t('errors.turn.rulesetUnsupported')"
      type="error"
      @dismiss="errors.global = null"
    />
    <BaseSnackbar
      v-else-if="errors.global === 'duplicateNumber' || errors.global === 'gapInSequence'"
      :message="t(`errors.turn.${errors.global}`)"
      type="error"
      @dismiss="errors.global = null"
    />
  </form>
</template>
