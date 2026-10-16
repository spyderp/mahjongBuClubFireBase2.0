<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/components/ui/BaseSelect.vue'
import { useGameTurns } from '@/composables/useGameTurns'
import type { TurnDraft } from '@/composables/useGameTurns'
import { DataError, ERROR_KEYS } from '@/data/errors'
import type { CreateTurnInput, TurnRecord } from '@/data/turns.repository'
import { validateRepresentable } from '@/domain/handValue'
import type { HandResultType } from '@/domain/handValue'
import { isRenchan, minTurns } from '@/domain/rules'
import type { HandOutcome } from '@/domain/rules'
import { checkSquare, resolveTurn } from '@/domain/turn'
import type { TurnPlayer, TurnResolution, TurnWinnerInput } from '@/domain/turn'
import type { PlayerId, ResultType, Seat } from '@/domain/types'
import { sumYakuHan, validateChiitoitsuFu, validateWindYaku, YAKU_CATALOG } from '@/domain/yaku'
import type { YakuCondition, YakuId } from '@/domain/yaku'
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
const {
  data: turns,
  nextHand,
  registerTurn,
  saveDraft,
  loadDraft,
  clearDraft,
} = useGameTurns(props.game.id)

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
const winnerIds = ref<PlayerId[]>([])
const discarderId = ref<PlayerId | ''>('')
const winnerToAdd = ref('')
const selectedYaku = ref<YakuId[]>([])
const yakuHanOverride = ref('0')
const doraCount = ref('0')
const fu = ref('20')
const tenpai = ref<PlayerId[]>([])
const chomboId = ref<PlayerId | ''>('')
const riichiPlayers = ref<PlayerId[]>([])

const errors = reactive<{ field: string | null; global: string | null }>({
  field: null,
  global: null,
})

/**
 * RF-18.1 y RF-23.3: ronda, localía y honba **no se escriben**. `nextHand` viene de
 * `domain/replay.ts` a través del composable, y es `null` cuando la partida no se puede reproducir.
 */
const dealerId = computed<PlayerId | ''>(() => {
  const dealerSeat = nextHand.value?.dealer

  if (dealerSeat === undefined) {
    return ''
  }

  return table.value.find((player) => player.seat === dealerSeat)?.playerId ?? ''
})

const roundWind = computed(() => nextHand.value?.wind ?? 'east')
const honba = computed(() => nextHand.value?.honba ?? 0)
const reproducible = computed(() => nextHand.value !== null)

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

/** Yaku disponible con su nombre; el valor real sale del motor (RF-4.x). */
const yakuOptions = computed<readonly SelectOption[]>(() =>
  YAKU_CATALOG.map((definition) => ({ value: definition.id, label: t(`yaku.${definition.id}`) })),
)

const isWin = computed(() => resultType.value === 'tsumo' || resultType.value === 'ron')
const isDraw = computed(() => resultType.value === 'ryuukyoku')
const isChombo = computed(() => resultType.value === 'chombo')

/**
 * RF-22.2: el contexto que decide qué yaku cuentan. La captura no modela mano abierta ni kan —eso
 * es 004, «verificación de la mano»—, así que la mano se supone cerrada y sin kan, que es lo que
 * quiere decir un jugador que no marca lo contrario.
 */
const yakuContext = computed(() => ({
  resultType: (isWin.value ? resultType.value : 'ryuukyoku') as ResultType,
  isClosedHand: true,
  hasRiichiDeclared: riichiPlayers.value.length > 0,
  hasKan: false,
  isFirstHand: turnNo.value === 1,
  isFinalHand: false,
}))

/** RF-22.1: el total sale del catálogo. El ajuste es un delta aparte, no un segundo total. */
const yakuSum = computed(() => sumYakuHan(selectedYaku.value, yakuContext.value))
const catalogHan = computed(() => yakuSum.value.han)
const overrideDelta = computed(() => Number(yakuHanOverride.value))
const totalHan = computed(() => catalogHan.value + overrideDelta.value)

/**
 * RF-21.2: un ganador no puede ser el descartador ni al revés. Las dos listas se recortan con la
 * otra, así que la opción problemática **no aparece** y no se puede llegar a ella desde la interfaz.
 */
const winnerOptions = computed<readonly SelectOption[]>(() =>
  table.value
    .filter(
      (player) =>
        !winnerIds.value.includes(player.playerId) && player.playerId !== discarderId.value,
    )
    .map((player) => ({
      value: player.playerId,
      label: t(`gamesView.seats.${player.seat}`),
    })),
)

const discarderOptions = computed<readonly SelectOption[]>(() =>
  table.value
    .filter((player) => !winnerIds.value.includes(player.playerId))
    .map((player) => ({
      value: player.playerId,
      label: t(`gamesView.seats.${player.seat}`),
    })),
)

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
 * RF-22.8: el disparador del rechazo es **no haber marcado ningún yaku**. Ni los dora ni el ajuste
 * lo sustituyen, que es justo lo que evita que el ajuste se convierta en una puerta trasera.
 */
function handFieldsComplete(): boolean {
  return (
    selectedYaku.value.length > 0 &&
    isNonNegativeInteger(doraCount.value) &&
    isNonNegativeInteger(fu.value)
  )
}

function toggleIn(list: PlayerId[], playerId: PlayerId): void {
  const index = list.indexOf(playerId)

  if (index === -1) {
    list.push(playerId)

    return
  }

  list.splice(index, 1)
}

function toggleYaku(id: YakuId): void {
  const index = selectedYaku.value.indexOf(id)

  if (index === -1) {
    selectedYaku.value.push(id)

    return
  }

  selectedYaku.value.splice(index, 1)
}

function seatOf(playerId: PlayerId): Seat | undefined {
  return table.value.find((player) => player.playerId === playerId)?.seat
}

function labelOf(playerId: PlayerId): string {
  const seat = seatOf(playerId)

  return seat === undefined ? '' : t(`gamesView.seats.${seat}`)
}

/** RF-21.1: añadir un ganador al ron. El tsumo no admite más de uno (RF-21.5). */
function addWinner(): void {
  if (winnerToAdd.value === '') {
    return
  }

  const candidate = winnerToAdd.value as PlayerId

  if (winnerIds.value.includes(candidate)) {
    winnerToAdd.value = ''

    return
  }

  winnerIds.value.push(candidate)
  winnerToAdd.value = ''
}

function removeWinner(playerId: PlayerId): void {
  toggleIn(winnerIds.value, playerId)
}

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
    errors.global = 'errors.turn.rulesetUnsupported'
    return
  }

  if (session.user === null) {
    errors.global = 'errors.session.required'
    return
  }

  if (!reproducible.value || dealerId.value === '') {
    errors.global = 'errors.turn.notReproducible'
    return
  }

  const base = {
    players: players.value,
    dealerId: dealerId.value as PlayerId,
    honba: honba.value,
    riichiDeclaredBy: [...riichiPlayers.value],
    riichiSticksBefore: riichiSticksBefore.value,
  }

  let resolution: ReturnType<typeof resolveTurn> | null = null

  if (isWin.value) {
    /**
     * RF-21.5: el club vetó el *suufon renta*, así que un tsumo con más de un ganador se rechaza
     * con su propio aviso y no se guarda como una mano normal.
     */
    if (resultType.value === 'tsumo' && winnerIds.value.length > 1) {
      errors.global = ERROR_KEYS.suufonRejected
      return
    }

    if (winnerIds.value.length === 0) {
      errors.field = 'resultRequired'
      return
    }

    if (resultType.value === 'ron' && discarderId.value === '') {
      errors.field = 'resultRequired'
      return
    }

    if (!handFieldsComplete()) {
      errors.field = selectedYaku.value.length === 0 ? 'noYaku' : 'handFieldsRequired'
      return
    }

    const firstWinner = winnerIds.value[0]
    const winnerSeat = firstWinner === undefined ? undefined : seatOf(firstWinner)

    if (winnerSeat === undefined) {
      errors.field = 'resultRequired'
      return
    }

    const windCheck = validateWindYaku(selectedYaku.value, {
      seat: winnerSeat,
      roundWind: roundWind.value,
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

    const representable = validateRepresentable({
      han: catalogHan.value + Number(doraCount.value),
      fu: Number(fu.value),
      resultType: resultType.value as HandResultType,
    })

    if (!representable.ok) {
      errors.field = 'notRepresentable'
      return
    }

    const hand = {
      yaku: selectedYaku.value,
      yakuHan: totalHan.value,
      doraCount: Number(doraCount.value),
      fu: Number(fu.value),
    }
    const winners: readonly TurnWinnerInput[] = winnerIds.value.map((playerId) => ({
      playerId,
      hand,
    }))

    const turnInput =
      resultType.value === 'ron'
        ? {
            ...base,
            resultType: 'ron' as const,
            winners,
            discarderId: discarderId.value as PlayerId,
          }
        : { ...base, resultType: 'tsumo' as const, winners }

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

    const outcome = resolveTurn({ ...base, resultType: 'ryuukyoku', tenpai: [...tenpai.value] })

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
    }).ok
  ) {
    errors.field = 'notSquare'
    return
  }

  if (resolution !== null) {
    await persist(resolution.resolution)
  }
}

/**
 * El renchan se decide con la **localía real** de este turno y no con el asiento Este. Es el mismo
 * criterio con el que `domain/replay.ts` avanza la localía, así que el turno guardado y el
 * re-derivado dicen lo mismo: antes de `specs/002` el formulario miraba `seat === 'east'` y guardaba
 * el renchan al revés a partir del primer cambio de localía.
 */
function handOutcome(): HandOutcome {
  const dealer = dealerId.value as PlayerId

  if (isWin.value) {
    return winnerIds.value.includes(dealer) ? { type: 'dealerWin' } : { type: 'otherWin' }
  }

  if (isDraw.value) {
    return tenpai.value.includes(dealer) ? { type: 'dealerTenpaiDraw' } : { type: 'otherDraw' }
  }

  // El chombo no interrumpe la partida (RF-7.3): el dealer pierde la mano y la localía avanza.
  return { type: 'otherDraw' }
}

async function persist(resolution: TurnResolution): Promise<void> {
  const capturedBy = session.user?.id ?? ''

  const input: CreateTurnInput = {
    turnNo: turnNo.value,
    wind: roundWind.value,
    dealerId: dealerId.value as PlayerId,
    honba: honba.value,
    resultType: resultType.value as ResultType,
    yaku: isWin.value ? [...selectedYaku.value] : [],
    yakuHan: isWin.value ? catalogHan.value : 0,
    yakuHanOverride: isWin.value ? Number(yakuHanOverride.value) : 0,
    doraCount: isWin.value ? Number(doraCount.value) : 0,
    fu: isWin.value ? Number(fu.value) : 0,
    tenpai: isDraw.value ? [...tenpai.value] : [],
    riichiDeclaredBy: [...riichiPlayers.value],
    riichiSticks: resolution.riichiSticks,
    value: resolution.values,
    deltas: resolution.deltas,
    /**
     * RF-18.13: el descartador y quien hizo chombo son captura, no cálculo, así que los escribe
     * este formulario. Sin ellos la partida guardada no se puede volver a resolver, que es lo que
     * impide re-derivar al corregir o al borrar (RF-18.7 y RF-18.9).
     */
    discarderId: resultType.value === 'ron' && discarderId.value !== '' ? discarderId.value : null,
    chomboId: isChombo.value && chomboId.value !== '' ? chomboId.value : null,
    capturedBy,
    isRenchan: isRenchan(handOutcome()),
    isFinalTurn: turnNo.value >= minTurns(props.game.gameLength),
  }

  try {
    const saved = await registerTurn.mutateAsync(input)

    resetForm()
    pauseDraft()
    clearDraft()
    emit('saved', saved)
  } catch (caught: unknown) {
    errors.global = caught instanceof DataError ? ERROR_KEYS[caught.code] : 'common.errorAction'
    errorDetails.value = caught instanceof DataError ? caught.details : {}
  }
}

/**
 * RF-23.1: tras guardar, el formulario vuelve a estar en blanco. Lo que **no** se reinicia es el
 * estado derivado —ronda, localía y honba—, que no lo escribe quien captura (RF-23.4).
 */
function resetForm(): void {
  resultType.value = ''
  winnerIds.value = []
  winnerToAdd.value = ''
  discarderId.value = ''
  selectedYaku.value = []
  yakuHanOverride.value = '0'
  doraCount.value = '0'
  fu.value = '20'
  tenpai.value = []
  chomboId.value = ''
  riichiPlayers.value = []
}

/** Los parámetros del mensaje del rechazo: qué turno lo provoca (RF-18.16). */
const errorDetails = ref<Readonly<Record<string, string>>>({})

function conditionLabel(condition: YakuCondition): string {
  return t(`turnForm.conditions.${condition.kind}`)
}

/** Un borrador viene de `localStorage` y no tiene tipo: se estrecha lista a lista y sin adivinar. */
function playerIdsOf(raw: unknown): PlayerId[] {
  return Array.isArray(raw) ? raw.filter((id): id is PlayerId => typeof id === 'string') : []
}

function yakuIdsOf(raw: unknown): YakuId[] {
  return Array.isArray(raw) ? raw.filter((id): id is YakuId => typeof id === 'string') : []
}

/** RF-15.8: el borrador se guarda con cada cambio y se restaura al montar. */
function draftOf(): TurnDraft {
  return {
    resultType: resultType.value,
    winnerIds: [...winnerIds.value],
    discarderId: discarderId.value,
    selectedYaku: [...selectedYaku.value],
    yakuHanOverride: yakuHanOverride.value,
    doraCount: doraCount.value,
    fu: fu.value,
    tenpai: [...tenpai.value],
    chomboId: chomboId.value,
    riichiPlayers: [...riichiPlayers.value],
  }
}

/** El borrador no se escribe mientras el formulario se restaura o se reinicia: se guardaría vacío. */
let draftPaused = true

function pauseDraft(): void {
  draftPaused = true
  void nextTick(() => {
    draftPaused = false
  })
}

function restoreDraft(): void {
  const draft = loadDraft()

  if (draft === null) {
    return
  }

  if (typeof draft.resultType === 'string') {
    resultType.value = draft.resultType as ResultType
  }
  if (Array.isArray(draft.winnerIds)) {
    winnerIds.value = playerIdsOf(draft.winnerIds)
  }
  if (typeof draft.discarderId === 'string') {
    discarderId.value = draft.discarderId as PlayerId
  }
  if (Array.isArray(draft.selectedYaku)) {
    selectedYaku.value = yakuIdsOf(draft.selectedYaku)
  }
  if (typeof draft.yakuHanOverride === 'string') {
    yakuHanOverride.value = draft.yakuHanOverride
  }
  if (typeof draft.doraCount === 'string') {
    doraCount.value = draft.doraCount
  }
  if (typeof draft.fu === 'string') {
    fu.value = draft.fu
  }
  if (Array.isArray(draft.tenpai)) {
    tenpai.value = playerIdsOf(draft.tenpai)
  }
  if (typeof draft.chomboId === 'string') {
    chomboId.value = draft.chomboId as PlayerId
  }
  if (Array.isArray(draft.riichiPlayers)) {
    riichiPlayers.value = playerIdsOf(draft.riichiPlayers)
  }
}

watch(
  draftOf,
  (draft) => {
    /**
     * Un borrador sin tipo de resultado no es una captura en curso: es el formulario recién
     * reiniciado o recién cancelado. No se guarda nunca, y con eso RF-23.2 se cumple sin depender
     * del orden de los avisos —tras `resetForm()` el borrador está vacío, así que aunque el
     * vigilante volviera a dispararse no escribiría nada y la recarga no restauraría lo guardado.
     */
    if (!draftPaused && typeof draft.resultType === 'string' && draft.resultType !== '') {
      saveDraft(draft)
    }
  },
  { deep: true },
)

onMounted(() => {
  restoreDraft()
  pauseDraft()
})

function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="handleSubmit">
    <h2 class="text-lg font-semibold">
      {{ t('turnForm.title') }}
    </h2>

    <fieldset
      v-if="nextHand !== null"
      class="flex flex-col gap-1 rounded border border-mahjong-border px-3 py-2 text-sm"
      data-test="next-hand"
    >
      <legend class="px-1 text-mahjong-muted">
        {{ t('turnForm.nextHand.title') }}
      </legend>
      <span class="flex justify-between">
        <span class="text-mahjong-muted">{{ t('turnForm.nextHand.roundWind') }}</span>
        <span data-test="next-wind">{{ t(`gamesView.seats.${nextHand.wind}`) }}</span>
      </span>
      <span class="flex justify-between">
        <span class="text-mahjong-muted">{{ t('turnForm.nextHand.dealerSeat') }}</span>
        <span data-test="next-dealer">
          {{ dealerId === '' ? '' : t(`gamesView.seats.${seatOf(dealerId)}`) }}
        </span>
      </span>
      <span class="flex justify-between">
        <span class="text-mahjong-muted">{{ t('turnForm.nextHand.honba') }}</span>
        <span data-test="next-honba">{{ nextHand.honba }}</span>
      </span>
    </fieldset>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.resultType') }}</span>
        <BaseSelect v-model="resultType" name="resultType" :options="resultTypeOptions" />
      </label>
    </div>

    <fieldset class="flex flex-col gap-1 text-sm" data-test="riichi">
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
      <div class="flex flex-col gap-1 text-sm" data-test="winners">
        <span class="text-mahjong-muted">{{ t('turnForm.winners') }}</span>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="winner in winnerIds"
            :key="winner"
            class="flex items-center gap-1 rounded border border-mahjong-border px-2 py-1"
            :data-test="`winner-${seatOf(winner)}`"
          >
            {{ seatOf(winner) === undefined ? '' : t(`gamesView.seats.${seatOf(winner)}`) }}
            <button
              type="button"
              class="text-mahjong-negative"
              :aria-label="t('common.close')"
              @click="removeWinner(winner)"
            >
              ×
            </button>
          </span>
        </div>
        <BaseSelect
          v-model="winnerToAdd"
          name="winnerId"
          :placeholder="t('turnForm.winner')"
          :options="winnerOptions"
          @update:model-value="addWinner"
        />
      </div>

      <label v-if="resultType === 'ron'" class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.discarder') }}</span>
        <BaseSelect v-model="discarderId" name="discarderId" :options="discarderOptions" />
      </label>

      <div class="flex flex-col gap-1 text-sm">
        <span class="text-mahjong-muted">{{ t('turnForm.yaku') }}</span>
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
      </div>

      <div class="flex flex-col gap-1 text-sm">
        <label class="flex flex-col gap-1">
          <span>{{ t('turnForm.yakuHanOverride') }}</span>
          <BaseInput v-model="yakuHanOverride" name="yakuHanOverride" type="number" />
        </label>
        <span class="flex justify-between" data-test="han-total">
          <span class="text-mahjong-muted">{{ t('turnForm.catalogTotal') }}</span>
          <span>{{ totalHan }}</span>
        </span>
        <p
          v-if="overrideDelta !== 0"
          class="text-xs text-mahjong-warning"
          data-test="override-notice"
        >
          {{ t('turnForm.overrideNotice', { delta: overrideDelta }) }}
        </p>
        <ul class="flex flex-col gap-0 text-xs text-mahjong-muted" data-test="han-breakdown">
          <li v-for="entry in yakuSum.breakdown" :key="entry.id">
            {{ t(`yaku.${entry.id}`) }} · {{ entry.han }}
            {{
              entry.reason === 'counted'
                ? ''
                : entry.reason === 'limit'
                  ? t('turnForm.reasons.limit')
                  : t('turnForm.reasons.notCounted')
            }}
            <span v-if="entry.unmet.length > 0">
              ({{ entry.unmet.map(conditionLabel).join(', ') }})
            </span>
          </li>
        </ul>
      </div>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.dora') }}</span>
        <BaseInput v-model="doraCount" name="doraCount" type="number" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.fu') }}</span>
        <BaseInput v-model="fu" name="fu" type="number" />
      </label>
    </template>

    <fieldset v-else-if="isDraw" class="flex flex-col gap-1 text-sm" data-test="tenpai">
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

    <p
      v-if="errors.global !== null"
      class="text-xs text-mahjong-negative"
      data-test="capture-error"
    >
      {{ t(errors.global, errorDetails) }}
    </p>

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
  </form>
</template>
