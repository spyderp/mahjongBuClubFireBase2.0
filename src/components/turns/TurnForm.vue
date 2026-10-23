<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Multiselect from '@vueform/multiselect'
import '@vueform/multiselect/themes/default.css'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { SelectOption } from '@/components/ui/BaseSelect.vue'
import HelpModal from '@/components/turns/HelpModal.vue'
import ScoreTableModal from '@/components/turns/ScoreTableModal.vue'
import { useGameTurns } from '@/composables/useGameTurns'
import type { TurnDraft } from '@/composables/useGameTurns'
import { usePlayers } from '@/composables/usePlayers'
import { DataError, ERROR_KEYS } from '@/data/errors'
import type { CreateTurnInput, TurnRecord } from '@/data/turns.repository'
import { sumHandYakuHan, validateRepresentable } from '@/domain/handValue'
import type { HandResultType, HandSituation, HandValueInput } from '@/domain/handValue'
import { isRenchan, minTurns } from '@/domain/rules'
import type { HandOutcome } from '@/domain/rules'
import { checkSquare, resolveTurn } from '@/domain/turn'
import type { TurnInput, TurnPlayer, TurnResolution, TurnWinnerInput } from '@/domain/turn'
import type { PlayerId, ResultType, Seat, Wind } from '@/domain/types'
import { validateChiitoitsuFu, validateWindYaku, YAKU_CATALOG } from '@/domain/yaku'
import type { YakuCondition, YakuHanSum, YakuId } from '@/domain/yaku'
import type { GameRecord } from '@/data/games.repository'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{
  game: GameRecord
}>()

const emit = defineEmits<{
  saved: [turn: TurnRecord]
  cancel: []
}>()

const { t, n } = useI18n()
const session = useSessionStore()
const { data: clubPlayers } = usePlayers()
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
const yakuFilter = ref('')
const tenpai = ref<PlayerId[]>([])

/**
 * T07–T10 · RF-31.1, RF-31.2, RF-32.1 y RF-32.3. La mano se captura **por ganador**.
 *
 * `baseValues` es la mano que se está capturando: la del **primer** ganador, o la que se prepara
 * antes de elegir ganador. Los demás ganadores la heredan —en un ron múltiple casi todas las manos
 * se parecen— hasta que alguien la edita; en ese momento el ganador se queda con la suya.
 *
 * `ownValues` son las manos ya separadas: las de los ganadores que alguien ha tocado.
 *
 * `handContexts` es el contexto de cada ganador —si su mano está **cerrada** y si tuvo **kan**— y
 * nunca se hereda: si una mano está abierta o tuvo kan, es de **esa** mano (RF-31.1 y RF-31.2).
 */
type HandValues = {
  yaku: YakuId[]
  yakuHanOverride: string
  doraCount: string
  fu: string
}

type HandContext = {
  isClosedHand: boolean
  hasKan: boolean
}

function newHandValues(): HandValues {
  return { yaku: [], yakuHanOverride: '0', doraCount: '0', fu: '20' }
}

/** Los valores por defecto del contexto: mano cerrada y sin kan, que es lo que se suponía antes. */
const DEFAULT_HAND_CONTEXT: HandContext = { isClosedHand: true, hasKan: false }

const baseValues = reactive<HandValues>(newHandValues())
const ownValues = reactive<Record<string, HandValues>>({})
const handContexts = reactive<Record<string, HandContext>>({})

const chomboId = ref<PlayerId | ''>('')
const riichiPlayers = ref<PlayerId[]>([])

/** RF-28.1 y RF-28.4: los dos modales de consulta no capturan nada, solo se abren y se cierran. */
const helpOpen = ref(false)
const scoreTableOpen = ref(false)

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

/**
 * RF-24.1: el **nombre** del jugador, no solo su asiento. Si no está en la lista del club —un
 * invitado, o un turno escrito antes de que se le diera de alta— se cae al identificador, que al
 * menos señala a alguien concreto en vez de dejar la etiqueta en blanco.
 */
const playerNames = computed<ReadonlyMap<PlayerId, string>>(
  () => new Map((clubPlayers.value ?? []).map((player) => [player.id, player.name])),
)

/**
 * El primer ganador: el que pone la mano que los demás heredan mientras nadie la edita.
 */
function firstWinnerId(): PlayerId | undefined {
  return winnerIds.value[0]
}

/**
 * Los valores de la mano de un ganador. Sin ganador —la mano que se prepara antes de elegirlo— son
 * los de la mano en curso.
 */
function valuesOf(playerId: PlayerId | undefined): HandValues {
  if (playerId === undefined) {
    return baseValues
  }

  return ownValues[playerId] ?? baseValues
}

/** El contexto de la mano de un ganador: cerrada y kan (RF-31.1 y RF-31.2). */
function contextOf(playerId: PlayerId | undefined): HandContext {
  if (playerId === undefined) {
    return DEFAULT_HAND_CONTEXT
  }

  return handContexts[playerId] ?? DEFAULT_HAND_CONTEXT
}

/** Contexto reactivo para v-model en los checkboxes de cada ganador. */
const winnerContext = ref<Record<string, { isClosedHand: boolean; hasKan: boolean }>>({})

function updateWinnerContext(): void {
  interface WinnerContextValue {
    isClosedHand: boolean
    hasKan: boolean
  }
  const ctx: Record<string, WinnerContextValue> = {}

  for (const playerId of winnerIds.value) {
    const context = handContexts[playerId] ?? DEFAULT_HAND_CONTEXT

    // Creamos un objeto reactivo individual para cada ganador
    // Esto permite que v-model funcione correctamente con getters/setters
    const playerContext = reactive({
      _isClosedHand: context.isClosedHand,
      _hasKan: context.hasKan,
      get isClosedHand() {
        return this._isClosedHand
      },
      set isClosedHand(v: boolean) {
        this._isClosedHand = v
        context.isClosedHand = v
      },
      get hasKan() {
        return this._hasKan
      },
      set hasKan(v: boolean) {
        this._hasKan = v
        context.hasKan = v
      },
    })

    ctx[playerId] = playerContext
  }

  winnerContext.value = ctx
}

// Actualizar el contexto cuando cambien los ganadores
watch(winnerIds, updateWinnerContext, { immediate: true, deep: true })

/** Helper para acceder al contexto de forma segura sin optional chaining en v-model. */
function winnerCtx(playerId: PlayerId | undefined): { isClosedHand: boolean; hasKan: boolean } {
  if (!playerId) return { isClosedHand: true, hasKan: false }
  return winnerContext.value[playerId] ?? { isClosedHand: true, hasKan: false }
}

/** La clave de un panel de mano: el asiento del ganador, que es como se habla de él en la mesa. */
function panelKey(playerId: PlayerId | undefined): string {
  if (playerId === undefined) {
    return 'base'
  }

  return seatOf(playerId) ?? playerId
}

/**
 * Los paneles de mano que se pintan: el del **primer** ganador —o el de la mano en curso, antes de
 * elegir ganador— y el de cada uno de los demás (RF-32.1).
 */
const handPanels = computed<readonly { key: string; playerId: PlayerId | undefined }[]>(() => {
  const first = firstWinnerId()
  const panels: { key: string; playerId: PlayerId | undefined }[] = [
    { key: panelKey(first), playerId: first },
  ]

  for (const playerId of winnerIds.value.slice(1)) {
    panels.push({ key: panelKey(playerId), playerId })
  }

  return panels
})

/**
 * Separa la mano de un ganador de la del primero (RF-32.1).
 *
 * A partir de aquí sus yaku, su ajuste, sus dora y sus fu son los suyos: los demás ya no los
 * heredan y editarlos no le cambia la mano a nadie.
 */
function detachValues(playerId: PlayerId): void {
  if (playerId === firstWinnerId() || ownValues[playerId] !== undefined) {
    return
  }

  ownValues[playerId] = {
    yaku: [...baseValues.yaku],
    yakuHanOverride: baseValues.yakuHanOverride,
    doraCount: baseValues.doraCount,
    fu: baseValues.fu,
  }
}

/**
 * La situación de la mano en curso: lo que **no** depende del ganador (RF-31.5). El resultado, si
 * alguien declaró riichi y si la mano es la primera o la última son de la partida, no de la mano.
 */
function situationOf(): HandSituation {
  return {
    resultType: (isWin.value ? resultType.value : 'ryuukyoku') as ResultType,
    hasRiichiDeclared: riichiPlayers.value.length > 0,
    isFirstHand: turnNo.value === 1,
    isFinalHand: false,
  }
}

/** Los datos de la mano de un ganador que no dependen del total. */
function handShapeOf(playerId: PlayerId | undefined): HandValueInput {
  const values = valuesOf(playerId)
  const context = contextOf(playerId)

  return {
    yaku: [...values.yaku],
    yakuHan: 0,
    doraCount: Number(values.doraCount),
    fu: Number(values.fu),
    isClosedHand: context.isClosedHand,
    hasKan: context.hasKan,
    yakuHanOverride: Number(values.yakuHanOverride),
  }
}

/**
 * El desglose de yaku de la mano de un ganador, con el contexto de **ese** ganador (RF-31.3 y
 * RF-31.4). La lógica de señalar qué yaku no cuenta ya vive en `domain/yaku.ts`: aquí solo se le
 * pasa el contexto que se ha capturado.
 */
function yakuSumOf(playerId: PlayerId | undefined): YakuHanSum {
  return sumHandYakuHan(handShapeOf(playerId), situationOf())
}

/** La suma del catálogo de la mano de un ganador: lo que cuentan sus yaku (RF-22.1). */
function catalogHanOf(playerId: PlayerId | undefined): number {
  return yakuSumOf(playerId).han
}

/** El ajuste a mano de los han de un ganador, como delta sobre su catálogo (RF-22.9). */
function overrideDeltaOf(playerId: PlayerId | undefined): number {
  return Number(valuesOf(playerId).yakuHanOverride)
}

/** El total de la mano de un ganador: su catálogo más su ajuste. */
function totalHanOf(playerId: PlayerId | undefined): number {
  return catalogHanOf(playerId) + overrideDeltaOf(playerId)
}

/**
 * La mano de un ganador tal y como la describe el formulario: lo marcado más el ajuste, con su
 * contexto. Es lo que se envía a `resolveTurn`, y también lo que la mesa previsualiza.
 */
function handOf(playerId: PlayerId | undefined): HandValueInput {
  return { ...handShapeOf(playerId), yakuHan: totalHanOf(playerId) }
}

/**
 * El turno que el formulario describe ahora mismo, listo para `resolveTurn`, o `null` si todavía no
 * hay uno: sin tipo de resultado, sin ganador, sin descartador en un ron, sin tenpai en un empate o
 * sin chombo en un chombo.
 *
 * Se construye **sin** las validaciones de negocio de `handleSubmit` a propósito: la mesa tiene que
 * poder enseñar los pagos de una mano que luego se va a rechazar por otra cosa —por ejemplo, que su
 * combinación de han y fu no esté en la tabla—. Rechazar antes de dibujar sería dejar la mesa muda
 * justo cuando hace falta leer la cifra.
 */
function currentTurnInput(): TurnInput | null {
  if (dealerId.value === '') {
    return null
  }

  const base = {
    players: players.value,
    dealerId: dealerId.value as PlayerId,
    honba: honba.value,
    riichiDeclaredBy: [...riichiPlayers.value],
    riichiSticksBefore: riichiSticksBefore.value,
    /**
     * RF-31.5: si esta es la primera mano de la partida. Lo necesitan los yaku que solo cuentan en
     * la primera (`tenhou`, `chiihou`, `suuchaRiichi`).
     */
    isFirstHand: turnNo.value === 1,
  }

  if (isWin.value) {
    if (winnerIds.value.length === 0) {
      return null
    }

    /**
     * RF-32.1: cada ganador lleva **su** mano. En un ron múltiple no son la misma, y usar una sola
     * era justo lo que el motor no podía expresar.
     */
    const winners: readonly TurnWinnerInput[] = winnerIds.value.map((playerId) => ({
      playerId,
      hand: handOf(playerId),
    }))

    if (resultType.value === 'ron') {
      return discarderId.value === ''
        ? null
        : { ...base, resultType: 'ron', winners, discarderId: discarderId.value as PlayerId }
    }

    return { ...base, resultType: 'tsumo', winners }
  }

  if (isDraw.value) {
    return tenpai.value.length === 0
      ? null
      : { ...base, resultType: 'ryuukyoku', tenpai: [...tenpai.value] }
  }

  if (isChombo.value && chomboId.value !== '') {
    return { ...base, resultType: 'chombo', chomboId: chomboId.value }
  }

  return null
}

/**
 * Resuelve el turno en curso. Lo usa `handleSubmit` para guardar y la mesa para previsualizar, y
 * ambos leen **la misma cuenta**: si la mesa dibujara unos pagos distintos de los que se guardan,
 * la pantalla estaría enseñando una cosa y escribiendo otra.
 *
 * Cuando el turno aún no se puede resolver devuelve `null`, que en el guardar es un rechazo y en la
 * mesa es «no hay diferencia que pintar».
 */
function resolveInputOf(input: TurnInput | null): ReturnType<typeof resolveTurn> | null {
  if (input === null) {
    return null
  }

  return resolveTurn(input)
}

/** El turno en curso ya resuelto, o `null` mientras no se pueda resolver. */
const currentTurn = computed<TurnResolution | null>(() => {
  const outcome = resolveInputOf(currentTurnInput())

  return outcome?.ok ? outcome.resolution : null
})

/**
 * Lo que este turno suma y resta a cada jugador, indexado por su identificador.
 */
const currentDeltas = computed<ReadonlyMap<PlayerId, number>>(
  () => new Map((currentTurn.value?.deltas ?? []).map((delta) => [delta.playerId, delta.delta])),
)

/** Una fila de la mesa: lo que RF-24 pide ver de cada jugador de una sentada. */
type MesaRow = {
  readonly playerId: PlayerId
  readonly seat: Seat
  readonly name: string
  /** El viento de la mano en curso (RF-24.4): el mismo para los cuatro, y el que gira la vuelta. */
  readonly wind: Wind
  readonly score: number
  readonly delta: number
  readonly deltaText: string
  readonly deltaClass: string
  /** La localía **real** del turno que se está capturando, no el asiento Este (RF-24.3). */
  readonly isDealer: boolean
  /** Si el jugador es el ganador de la mano que se está capturando. */
  readonly isWinner: boolean
  /** Si el jugador es el perdedor por ron (el descartador). */
  readonly isRonLoser: boolean
  /** Si el jugador ha declarado riichi en esta mano. */
  readonly hasRiichi: boolean
}

/**
 * RF-24 · La mesa. Los cuatro requisitos de `specs/003` caen en este único `computed`, y por eso van
 * juntos: separarlos produciría cuatro commits que rompen el mismo fichero (`plan.md` §5.2,
 * decisión 6).
 *
 * El marcador de la izquierda es el **acumulado** de los turnos guardados —dónde está cada uno en la
 * mesa— y la diferencia de la derecha es la del turno que se está **capturando**, la que va a sumar o
 * restar la mano que se está rellenando. No es la misma cifra y no debe serlo: mostrar la acumulada
 * haría que quien captura viera un número que no va a guardar, y una diferencia que incluye manos
 * anteriores no dice nada de la que tiene delante.
 *
 * Mientras el turno no se pueda resolver no hay diferencia que pintar, y la mesa no inventa ninguna:
 * todos los ceros salen sin color (casos límite 1 y 2).
 */
const mesa = computed<readonly MesaRow[]>(() => {
  const winners = isWin.value ? winnerIds.value : []
  const discarder = resultType.value === 'ron' ? discarderId.value : ''

  return players.value.map((player) => {
    const delta = currentDeltas.value.get(player.playerId) ?? 0

    return {
      playerId: player.playerId,
      seat: player.seat,
      name: playerNames.value.get(player.playerId) ?? player.playerId,
      wind: roundWind.value,
      score: player.score,
      delta,
      deltaText: delta > 0 ? `+${n(delta, 'points')}` : n(delta, 'points'),
      deltaClass: deltaClassOf(delta),
      isDealer: player.playerId === dealerId.value,
      isWinner: winners.includes(player.playerId),
      isRonLoser: player.playerId === discarder,
      hasRiichi: riichiPlayers.value.includes(player.playerId),
    }
  })
})

/**
 * RF-24.2: el color sale de los **tokens del tema** —`--color-mahjong-positive` y
 * `--color-mahjong-negative`, 003-qa.md D1— y de ninguna otra clase. El cero se queda sin clase: un
 * empate repartido deja a alguien con diferencia cero, y ese jugador no va en ningún color (caso
 * límite 2).
 */
function deltaClassOf(delta: number): string {
  if (delta > 0) {
    return 'text-mahjong-positive'
  }

  if (delta < 0) {
    return 'text-mahjong-negative'
  }

  return ''
}

function windBadgeClass(seat: Seat): string {
  switch (seat) {
    case 'east':
      return 'bg-mahjong-east'
    case 'south':
      return 'bg-mahjong-south'
    case 'west':
      return 'bg-mahjong-west'
    case 'north':
      return 'bg-mahjong-north'
  }
}

const playerOptions = computed<readonly SelectOption[]>(() =>
  table.value.map((player) => ({
    value: player.playerId,
    label: playerLabel(player.playerId),
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

/**
 * RF-25.1: el buscador deja solo las entradas cuyo nombre **contiene** lo escrito, sin distinguir
 * mayúsculas ni espacios alrededor. El catálogo son 46 nombres y quien captura busca «riic» o
 * «chanta» medio en inglés: recorrerlos a ojo para marcar cuatro yaku es el trabajo que el
 * requisito viene a quitar.
 *
 * RF-34.4: cada yaku se muestra como «japonés (inglés)», así que el nombre va en la etiqueta; y el
 * identificador —la forma romanizada que el club ya usaba— también se busca, para que escribir
 * «haitei» siga encontrando a la última entrega.
 *
 * Filtra **la lista**, nunca la captura: lo marcado sigue en `selectedYaku` aunque no se vea, así que
 * un filtro sin coincidencia no puede hacer perder lo que ya había. Por eso el total del catálogo no
 * se mueve al escribir.
 */
/**
 * RF-25.1: el buscador deja solo las entradas cuyo nombre **contiene** lo escrito, sin distinguir
 * mayúsculas ni espacios alrededor. El catálogo son 46 nombres y quien captura busca «riic» o
 * «chanta» medio en inglés: recorrerlos a ojo para marcar cuatro yaku es el trabajo que el
 * requisito viene a quitar.
 *
 * RF-34.4: cada yaku se muestra como «japonés (inglés)», así que el nombre va en la etiqueta; y el
 * identificador —la forma romanizada que el club ya usaba— también se busca, para que escribir
 * «haitei» siga encontrando a la última entrega.
 *
 * Búsqueda flexible: divide el término en palabras y verifica que TODAS estén presentes (en cualquier
 * orden). Así "seven pair" encuentra "Seven Pairs", "pair seven" también, etc.
 */
const visibleYakuOptions = computed<readonly SelectOption[]>(() => {
  const needle = yakuFilter.value.trim().toLowerCase()

  if (needle === '') {
    return yakuOptions.value
  }

  // Dividir en palabras y filtrar vacíos
  const words = needle.split(/\s+/).filter((w) => w.length > 0)

  return yakuOptions.value.filter((option) => {
    const haystack = `${option.label}`.toLowerCase()
    // TODAS las palabras deben estar presentes (en cualquier orden)
    return words.every((word) => haystack.includes(word))
  })
})

const isWin = computed(() => resultType.value === 'tsumo' || resultType.value === 'ron')
const isDraw = computed(() => resultType.value === 'ryuukyoku')
const isChombo = computed(() => resultType.value === 'chombo')

/**
 * RF-21.2: un ganador no puede ser el descartador ni al revés. Las dos listas se recortan con la
 * otra, así que la opción problemática **no aparece** y no se puede llegar a ella desde la interfaz.
 *
 * En tsumo no hay descartador, así que el filtro por descartador solo se aplica en ron.
 */
const winnerOptions = computed<readonly SelectOption[]>(() =>
  table.value
    .filter((player) => {
      const alreadyWinner = winnerIds.value.includes(player.playerId)
      const isDiscarderInRon = resultType.value === 'ron' && player.playerId === discarderId.value
      return !alreadyWinner && !isDiscarderInRon
    })
    .map((player) => ({
      value: player.playerId,
      label: playerLabel(player.playerId),
    })),
)

const discarderOptions = computed<readonly SelectOption[]>(() =>
  table.value
    .filter((player) => !winnerIds.value.includes(player.playerId))
    .map((player) => ({
      value: player.playerId,
      label: playerLabel(player.playerId),
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
 * Lo que le falta a la mano de un ganador, o `null` si está bien.
 *
 * RF-22.8: el disparador del rechazo es **no haber marcado ningún yaku**. Ni los dora ni el ajuste
 * lo sustituyen, que es justo lo que evita que el ajuste se convierta en una puerta trasera.
 *
 * Las comprobaciones son **por ganador** (RF-32.1): cada uno se mira con sus yaku, sus fu y su
 * contexto, y el yaku de viento se valida contra el asiento de ese ganador y no contra el del
 * primero.
 */
function handErrorOf(playerId: PlayerId): string | null {
  const values = valuesOf(playerId)

  if (values.yaku.length === 0) {
    return 'noYaku'
  }

  if (!isNonNegativeInteger(values.doraCount) || !isNonNegativeInteger(values.fu)) {
    return 'handFieldsRequired'
  }

  const seat = seatOf(playerId)

  if (seat === undefined) {
    return 'resultRequired'
  }

  const windCheck = validateWindYaku(values.yaku, {
    seat,
    roundWind: roundWind.value,
  })

  if (!windCheck.ok) {
    return 'windYaku'
  }

  const fuCheck = validateChiitoitsuFu(Number(values.fu), values.yaku.includes('chiitoitsu'))

  if (!fuCheck.ok) {
    return 'chiiFu'
  }

  const representable = validateRepresentable({
    han: catalogHanOf(playerId) + Number(values.doraCount),
    fu: Number(values.fu),
    resultType: resultType.value as HandResultType,
  })

  if (!representable.ok) {
    return 'notRepresentable'
  }

  return null
}

function toggleIn<T>(list: T[], item: T): void {
  const index = list.indexOf(item)

  if (index === -1) {
    list.push(item)

    return
  }

  list.splice(index, 1)
}

/**
 * Marcar un yaku en la mano de un ganador (RF-32.1). Editar la mano de un ganador que heredaba la
 * del primero lo separa de ella: a partir de ahí la suya es la suya.
 */
function toggleYaku(playerId: PlayerId | undefined, id: YakuId): void {
  if (playerId !== undefined) {
    detachValues(playerId)
  }

  if (valuesOf(playerId).yaku.includes(id)) {
    valuesOf(playerId).yaku = valuesOf(playerId).yaku.filter((item) => item !== id)
  } else {
    valuesOf(playerId).yaku = [...valuesOf(playerId).yaku, id]
  }
}
void toggleYaku
void conditionLabel

/** Asigna la lista de yaku de un ganador (RF-35.5). */
function setYakuList(playerId: PlayerId | undefined, value: unknown): void {
  if (playerId !== undefined) {
    detachValues(playerId)
  }

  if (Array.isArray(value)) {
    valuesOf(playerId).yaku = value.filter((item): item is YakuId => typeof item === 'string')
  } else {
    valuesOf(playerId).yaku = []
  }
}
function setHandValue(
  playerId: PlayerId | undefined,
  field: 'yakuHanOverride' | 'doraCount' | 'fu',
  value: string,
): void {
  if (playerId !== undefined) {
    detachValues(playerId)
  }

  valuesOf(playerId)[field] = value
}

function seatOf(playerId: PlayerId): Seat | undefined {
  return table.value.find((player) => player.playerId === playerId)?.seat
}

function seatOfActualLocation(initialSeat: Seat, dealerLocation: Seat): Seat | undefined {
  const seatMap: Record<Seat, number> = {
    east: 0,
    south: 1,
    west: 2,
    north: 3,
  }

  const seats: Seat[] = ['east', 'south', 'west', 'north']

  const initialSeatIndex = seatMap[initialSeat]
  const dealerLocationIndex = seatMap[dealerLocation]

  // Calculate the modular distance counter-clockwise (using + 4 to handle negatives safely)
  const windIndex = (initialSeatIndex - dealerLocationIndex + 4) % 4

  return seats[windIndex]
}
/**
 * RF-24.1: lo que ofrecen los **cinco** lugares donde se elige a un jugador —ganador, descartador,
 * tenpai, riichi y chombo—. El nombre va delante porque es lo que dice a quién se está eligiendo, y
 * el asiento detrás porque es lo que sitúa a quien juega; quitar cualquiera de los dos deja la
 * elección a medias.
 */
function playerLabel(playerId: PlayerId): string {
  const seat = seatOf(playerId)

  if (seat === undefined) {
    return ''
  }

  return t('turnForm.mesa.playerWithSeat', {
    name: playerNames.value.get(playerId) ?? playerId,
    seat: t(`gamesView.seats.${seat}`),
  })
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

  // UX: si el ganador elegido era el descartador, limpiamos el descartador
  // (un jugador no puede ser a la vez ganador y descartador en un ron)
  if (resultType.value === 'ron' && discarderId.value === candidate) {
    discarderId.value = ''
  }

  winnerIds.value.push(candidate)
  winnerToAdd.value = ''

  /**
   * El contexto del ganador nuevo es el de siempre: mano cerrada y sin kan (RF-31.1 y RF-31.2).
   * Sus valores no se tocan: hereda la mano que pone el primero hasta que alguien la edite.
   */
  handContexts[candidate] = { ...DEFAULT_HAND_CONTEXT }
}

/**
 * Quitar un ganador del ron.
 *
 * Si el que se va era el primero —el que ponía la mano que los demás heredaban— los que quedan se
 * quedan con la suya y el nuevo primero pone la suya. Perder el enlace es lo que evita que quitar
 * a un ganador le cambie la mano a otro por detrás.
 */
function removeWinner(playerId: PlayerId): void {
  const wasFirst = firstWinnerId() === playerId

  toggleIn(winnerIds.value, playerId)
  delete handContexts[playerId]
  delete ownValues[playerId]

  if (!wasFirst) {
    return
  }

  const next = firstWinnerId()

  if (next === undefined) {
    baseValues.yaku = []
    baseValues.yakuHanOverride = '0'
    baseValues.doraCount = '0'
    baseValues.fu = '20'

    return
  }

  const nextValues = ownValues[next] ?? baseValues

  for (const other of winnerIds.value) {
    if (other !== next && ownValues[other] === undefined) {
      ownValues[other] = {
        yaku: [...baseValues.yaku],
        yakuHanOverride: baseValues.yakuHanOverride,
        doraCount: baseValues.doraCount,
        fu: baseValues.fu,
      }
    }
  }

  baseValues.yaku = [...nextValues.yaku]
  baseValues.yakuHanOverride = nextValues.yakuHanOverride
  baseValues.doraCount = nextValues.doraCount
  baseValues.fu = nextValues.fu
  delete ownValues[next]
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

  let resolution: TurnResolution | null = null

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

    /**
     * RF-32.1: la mano se comprueba **ganador a ganador**. En un ron múltiple cada uno puede tener
     * yaku, fu y dora distintos, y el primero que falle es el que se avisa.
     */
    for (const winner of winnerIds.value) {
      const handError = handErrorOf(winner)

      if (handError !== null) {
        errors.field = handError
        return
      }
    }

    /**
     * El turno que se va a guardar sale del **mismo** `currentTurnInput` que previsualiza la mesa.
     * Que sean dos construcciones distintas era el modo barato de que la pantalla enseñara unos pagos
     * y escribiera otros.
     */
    const outcome = resolveInputOf(currentTurnInput())

    if (outcome === null || !outcome.ok) {
      errors.field = 'moreThanThreeWinners'
      return
    }

    resolution = outcome.resolution
  } else if (isDraw.value) {
    if (tenpai.value.length === 0) {
      errors.field = 'tenpaiRequired'
      return
    }

    const outcome = resolveInputOf(currentTurnInput())

    if (outcome === null || !outcome.ok) {
      errors.field = 'moreThanThreeWinners'
      return
    }

    resolution = outcome.resolution
  } else {
    if (chomboId.value === '') {
      errors.field = 'resultRequired'
      return
    }

    const outcome = resolveInputOf(currentTurnInput())

    resolution = outcome !== null && outcome.ok ? outcome.resolution : null
  }

  if (
    resolution !== null &&
    !checkSquare({
      deltas: resolution.deltas,
      riichiDeclared: riichiPlayers.value.length,
      riichiSticksClaimedThisTurn: riichiSticksClaimedThisTurn(),
    }).ok
  ) {
    errors.field = 'notSquare'
    return
  }

  if (resolution !== null) {
    await persist(resolution)
  }
}

/**
 * El renchan se decide con la **localía real** de este turno y no con el asiento Este. Es el mismo
 * criterio con el que `domain/replay.ts` avanza la localía, así que el turno guardado y el
 * re-derivado dicen lo mismo: antes de `specs/002` el formulario miraba `seat === 'east'` y guardaba
 * el renchan al revés a partir del primer cambio de localía.
 *
 * Lo que sale de aquí se usa **solo** para el renchan. El chombo no es renchan porque no hubo mano
 * jugada, y la localía la conserva el recorrido —RF-7.6 de `specs/001`—, no este valor: por eso el
 * `otherDraw` de abajo no dice que la localía avance, aunque el recorrido tampoco la mueva (T03).
 */
function handOutcome(): HandOutcome {
  const dealer = dealerId.value as PlayerId

  if (isWin.value) {
    return winnerIds.value.includes(dealer) ? { type: 'dealerWin' } : { type: 'otherWin' }
  }

  if (isDraw.value) {
    return tenpai.value.includes(dealer) ? { type: 'dealerTenpaiDraw' } : { type: 'otherDraw' }
  }

  return { type: 'otherDraw' }
}

async function persist(resolution: TurnResolution): Promise<void> {
  const capturedBy = session.user?.id ?? ''
  const first = firstWinnerId()

  const input: CreateTurnInput = {
    turnNo: turnNo.value,
    wind: roundWind.value,
    dealerId: dealerId.value as PlayerId,
    honba: honba.value,
    resultType: resultType.value as ResultType,
    /**
     * Los campos del turno son los de **siempre** (RF-32.2): los del primer ganador. El desglose
     * de cada uno, cuando hay más de un ganador, va aparte.
     */
    yaku: isWin.value ? [...baseValues.yaku] : [],
    yakuHan: isWin.value ? catalogHanOf(first) : 0,
    yakuHanOverride: isWin.value ? overrideDeltaOf(first) : 0,
    doraCount: isWin.value ? Number(baseValues.doraCount) : 0,
    fu: isWin.value ? Number(baseValues.fu) : 0,
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
    /**
     * RF-31.7: el contexto de cada ganador forma parte de lo que el turno guarda. Sin él, un
     * turno no se puede volver a derivar: no se sabría si su mano estaba abierta o tuvo kan.
     */
    ...(isWin.value
      ? {
          handContext: winnerIds.value.map((playerId) => ({
            playerId,
            isClosedHand: contextOf(playerId).isClosedHand,
            hasKan: contextOf(playerId).hasKan,
          })),
        }
      : {}),
    /**
     * RF-32.1 y RF-32.2: el desglose por ganador solo existe en un ron múltiple. Con un solo
     * ganador —o en un tsumo— el turno sigue guardando los campos de siempre.
     */
    ...(isWin.value && winnerIds.value.length > 1
      ? {
          winnerHands: winnerIds.value.map((playerId) => ({
            playerId,
            yaku: [...valuesOf(playerId).yaku],
            yakuHan: catalogHanOf(playerId),
            yakuHanOverride: overrideDeltaOf(playerId),
            doraCount: Number(valuesOf(playerId).doraCount),
            fu: Number(valuesOf(playerId).fu),
          })),
        }
      : {}),
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
  yakuFilter.value = ''
  baseValues.yaku = []
  baseValues.yakuHanOverride = '0'
  baseValues.doraCount = '0'
  baseValues.fu = '20'
  tenpai.value = []
  chomboId.value = ''
  riichiPlayers.value = []

  for (const playerId of Object.keys(ownValues)) {
    delete ownValues[playerId]
  }

  for (const playerId of Object.keys(handContexts)) {
    delete handContexts[playerId]
  }
}

/** Los parámetros del mensaje del rechazo: qué turno lo provoca (RF-18.16). */
const errorDetails = ref<Readonly<Record<string, string>>>({})

function conditionLabel(condition: YakuCondition): string {
  void condition
  return ''
}

/** Un borrador viene de `localStorage` y no tiene tipo: se estrecha lista a lista y sin adivinar. */
function playerIdsOf(raw: unknown): PlayerId[] {
  return Array.isArray(raw) ? raw.filter((id): id is PlayerId => typeof id === 'string') : []
}

function yakuIdsOf(raw: unknown): YakuId[] {
  return Array.isArray(raw) ? raw.filter((id): id is YakuId => typeof id === 'string') : []
}

/**
 * RF-15.8: el borrador se guarda con cada cambio y se restaura al montar.
 *
 * Los campos sueltos son los de **siempre** —los de la mano en curso— y las manos por ganador van
 * aparte, en `hands`. Un borrador escrito antes de 004 solo tiene los campos sueltos: sus ganadores
 * heredan esa mano, que es lo que se guardaba entonces.
 */
function draftOf(): TurnDraft {
  const hands: Record<string, unknown> = {}

  for (const playerId of winnerIds.value) {
    const values = valuesOf(playerId)

    hands[playerId] = {
      yaku: [...values.yaku],
      yakuHanOverride: values.yakuHanOverride,
      doraCount: values.doraCount,
      fu: values.fu,
      isClosedHand: contextOf(playerId).isClosedHand,
      hasKan: contextOf(playerId).hasKan,
      /** Si sus valores siguen siendo los de la mano en curso: entonces los hereda. */
      linked: ownValues[playerId] === undefined,
    }
  }

  return {
    resultType: resultType.value,
    winnerIds: [...winnerIds.value],
    discarderId: discarderId.value,
    selectedYaku: [...baseValues.yaku],
    yakuHanOverride: baseValues.yakuHanOverride,
    doraCount: baseValues.doraCount,
    fu: baseValues.fu,
    tenpai: [...tenpai.value],
    chomboId: chomboId.value,
    riichiPlayers: [...riichiPlayers.value],
    hands,
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
  if (typeof draft.yakuHanOverride === 'string') {
    baseValues.yakuHanOverride = draft.yakuHanOverride
  }
  if (typeof draft.doraCount === 'string') {
    baseValues.doraCount = draft.doraCount
  }
  if (typeof draft.fu === 'string') {
    baseValues.fu = draft.fu
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

  restoreHands(draft)
}

/**
 * Las manos por ganador del borrador (RF-31.1, RF-31.2 y RF-32.1).
 *
 * Un borrador escrito antes de 004 solo tiene los campos sueltos de la mano en curso: sus
 * ganadores la heredan, que es como se guardaba entonces. Uno escrito después trae `hands`, con la
 * mano de cada ganador y su contexto.
 */
function restoreHands(draft: TurnDraft): void {
  const raw = draft.hands
  const hands = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const first = firstWinnerId()

  baseValues.yaku = yakuIdsOf(draft.selectedYaku)

  for (const playerId of winnerIds.value) {
    const stored = hands[playerId]
    const own =
      typeof stored === 'object' && stored !== null
        ? (stored as Record<string, unknown>)
        : undefined

    handContexts[playerId] = {
      isClosedHand: own === undefined ? true : own.isClosedHand !== false,
      hasKan: own === undefined ? false : own.hasKan === true,
    }

    /**
     * Los que heredaban la mano en curso la vuelven a heredar; los que la tenían separada la
     * recuperan como suya.
     */
    const linked = own === undefined || own.linked === true

    if (linked || playerId === first) {
      continue
    }

    ownValues[playerId] = {
      yaku: yakuIdsOf(own?.yaku),
      yakuHanOverride: typeof own?.yakuHanOverride === 'string' ? own.yakuHanOverride : '0',
      doraCount: typeof own?.doraCount === 'string' ? own.doraCount : '0',
      fu: typeof own?.fu === 'string' ? own.fu : '20',
    }
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
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-display text-lg font-semibold">
        {{ t('turnForm.title') }}
      </h2>
      <div class="flex gap-2">
        <BaseButton type="button" variant="ghost" data-test="help-open" @click="helpOpen = true">
          {{ t('turnForm.help.open') }}
        </BaseButton>
        <BaseButton
          type="button"
          variant="ghost"
          data-test="score-table-open"
          @click="scoreTableOpen = true"
        >
          {{ t('turnForm.scoreTable.open') }}
        </BaseButton>
      </div>
    </div>

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

    <fieldset class="rounded border border-mahjong-border bg-mahjong-surface p-3" data-test="mesa">
      <legend class="px-1 text-mahjong-muted text-sm font-medium">
        {{ t('turnForm.mesa.title') }}
      </legend>
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="row in mesa"
          :key="row.playerId"
          class="relative rounded border border-mahjong-border bg-mahjong-bg p-3 transition-colors"
          :data-test="`mesa-${row.seat}`"
          :class="{
            'ring-2 ring-mahjong-positive': row.isWinner,
            'ring-2 ring-mahjong-negative': row.isRonLoser,
          }"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 rounded-full bg-mahjong-border flex items-center justify-center text-xs text-mahjong-muted"
              >
                {{ row.name.charAt(0) }}
              </div>
              <span class="font-medium text-sm" data-test="mesa-name">{{ row.name }}</span>
            </div>
            <span
              class="px-2 py-0.5 text-xs font-medium rounded-full text-white"
              :class="windBadgeClass(row.seat)"
              data-test="mesa-wind-badge"
            >
              {{
                dealerId === ''
                  ? ''
                  : t(`gamesView.seats.${seatOfActualLocation(row.seat, seatOf(dealerId))}`)
              }}
            </span>
          </div>
          <div class="flex items-baseline justify-between gap-2">
            <span class="font-mono text-xl font-bold text-mahjong-text" data-test="mesa-score">
              {{ n(row.score, 'points') }}
            </span>
            <span class="font-mono text-sm" :class="row.deltaClass" data-test="mesa-delta">
              {{ row.deltaText }}
            </span>
          </div>
          <div class="flex items-center justify-between mt-2">
            <span
              v-if="row.isDealer"
              class="px-1.5 py-0.5 text-xs rounded border border-mahjong-border text-mahjong-muted"
              data-test="mesa-dealer"
            >
              {{ t('turnForm.mesa.dealer') }}
            </span>
            <span
              v-if="row.hasRiichi"
              class="px-1.5 py-0.5 text-xs rounded-full bg-mahjong-accent/20 text-mahjong-accent shadow-glow-red"
              data-test="mesa-riichi"
            >
              {{ t('turnForm.riichi') }}
            </span>
          </div>
        </div>
      </div>
    </fieldset>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ t('turnForm.resultType') }}</span>
        <BaseSelect v-model="resultType" name="resultType" :options="resultTypeOptions" />
      </label>
    </div>

    <fieldset class="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-test="riichi">
      <legend class="text-mahjong-muted">{{ t('turnForm.riichi') }}</legend>
      <label
        v-for="player in players"
        :key="player.playerId"
        class="flex items-center gap-2"
        :data-test="`riichi-${player.seat}`"
      >
        <input
          type="checkbox"
          :checked="riichiPlayers.includes(player.playerId)"
          @change="toggleIn(riichiPlayers, player.playerId)"
        />
        <span>{{ playerLabel(player.playerId) }}</span>
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
            {{ playerLabel(winner) }}
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
      </div>

      <fieldset
        v-for="panel in handPanels"
        :key="panel.key"
        class="flex flex-col gap-1 rounded border border-mahjong-border px-3 py-2 text-sm"
        :data-test="`hand-${panel.key}`"
      >
        <legend class="px-1 text-mahjong-muted">
          {{
            panel.playerId === undefined ? t('turnForm.hand.pending') : playerLabel(panel.playerId)
          }}
        </legend>

        <label class="flex items-center gap-2">
          <input
            v-model="winnerCtx(panel.playerId).isClosedHand"
            type="checkbox"
            :data-test="`hand-${panel.key}-closed`"
          />
          <span>{{ t('turnForm.hand.closedHand') }}</span>
        </label>

        <label class="flex items-center gap-2">
          <input
            v-model="winnerCtx(panel.playerId).hasKan"
            type="checkbox"
            :data-test="`hand-${panel.key}-kan`"
          />
          <span>{{ t('turnForm.hand.hasKan') }}</span>
        </label>

        <div class="flex flex-col gap-1" data-test="yaku-options">
          <Multiselect
            :model-value="valuesOf(panel.playerId).yaku"
            :options="visibleYakuOptions"
            mode="tags"
            :searchable="true"
            :internal-search="false"
            :search-term="yakuFilter"
            :close-on-select="false"
            :create-tag="false"
            :can-clear="true"
            :hide-selected="false"
            track-by="value"
            label="label"
            value-prop="value"
            class="multiselect-mahjong"
            @update:model-value="(val: unknown) => setYakuList(panel.playerId, val)"
            @search-change="(q: string) => (yakuFilter = q ?? '')"
          />
          <div class="hidden">
            <label
              v-for="option in visibleYakuOptions"
              :key="option.value"
              class="flex items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                :checked="valuesOf(panel.playerId).yaku.includes(option.value as YakuId)"
                :value="option.value"
                @change="toggleYaku(panel.playerId, option.value as YakuId)"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="flex justify-between" data-test="han-total">
            <span class="text-mahjong-muted">{{ t('turnForm.catalogTotal') }}</span>
            <span>{{ catalogHanOf(panel.playerId) + overrideDeltaOf(panel.playerId) }}</span>
          </span>
          <p
            v-if="overrideDeltaOf(panel.playerId) !== 0"
            class="text-xs text-mahjong-warning"
            data-test="override-notice"
          >
            {{ t('turnForm.overrideNotice', { delta: overrideDeltaOf(panel.playerId) }) }}
          </p>
          <ul class="flex flex-col gap-0 text-xs text-mahjong-muted" data-test="han-breakdown">
            <li v-for="entry in yakuSumOf(panel.playerId).breakdown" :key="entry.id">
              {{ t(`yaku.${entry.id}`) }} · {{ entry.han }}
              {{
                entry.reason === 'counted'
                  ? ''
                  : entry.reason === 'limit'
                    ? t('turnForm.reasons.limit')
                    : t('turnForm.reasons.notCounted')
              }}
              <span v-if="entry.unmet && entry.unmet.length > 0">
                ({{ entry.unmet.map((c: any) => t(`turnForm.conditions.${c.kind}`)).join(', ') }})
              </span>
            </li>
          </ul>
        </div>

        <label class="flex flex-col gap-1 text-sm">
          <span>{{ t('turnForm.yakuHanOverride') }}</span>
          <BaseInput
            :model-value="valuesOf(panel.playerId).yakuHanOverride"
            name="yakuHanOverride"
            type="number"
            @update:model-value="setHandValue(panel.playerId, 'yakuHanOverride', $event)"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span>{{ t('turnForm.dora') }}</span>
          <BaseInput
            :model-value="valuesOf(panel.playerId).doraCount"
            name="doraCount"
            type="number"
            @update:model-value="setHandValue(panel.playerId, 'doraCount', $event)"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span>{{ t('turnForm.fu') }}</span>
          <BaseInput
            :model-value="valuesOf(panel.playerId).fu"
            name="fu"
            type="number"
            @update:model-value="setHandValue(panel.playerId, 'fu', $event)"
          />
        </label>
      </fieldset>
    </template>

    <fieldset v-else-if="isDraw" class="flex flex-col gap-1 text-sm" data-test="tenpai">
      <legend class="text-mahjong-muted">{{ t('turnForm.tenpai') }}</legend>
      <label
        v-for="player in players"
        :key="player.playerId"
        class="flex items-center gap-2"
        :data-test="`tenpai-${player.seat}`"
      >
        <input v-model="tenpai" type="checkbox" :value="player.playerId" />
        <span>{{ playerLabel(player.playerId) }}</span>
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

    <HelpModal :open="helpOpen" @close="helpOpen = false" />
    <ScoreTableModal :open="scoreTableOpen" @close="scoreTableOpen = false" />
  </form>
</template>

<style scoped>
/* Fix @vueform/multiselect colors for dark theme - force dark backgrounds and proper contrast */
.multiselect-mahjong.multiselect {
  background-color: var(--color-mahjong-bg) !important;
  border-color: var(--color-mahjong-border) !important;
  color: var(--color-mahjong-text) !important;
}

.multiselect-mahjong :deep(.multiselect-input) {
  color: var(--color-mahjong-text) !important;
  background-color: transparent !important;
}

.multiselect-mahjong :deep(.multiselect-single) {
  color: var(--color-mahjong-text) !important;
}

.multiselect-mahjong :deep(.multiselect-placeholder) {
  color: var(--color-mahjong-muted) !important;
}

.multiselect-mahjong :deep(.multiselect-option) {
  color: var(--color-mahjong-text) !important;
  background-color: var(--color-mahjong-surface) !important;
}

.multiselect-mahjong :deep(.multiselect-option.is-pointed) {
  background-color: var(--color-mahjong-border) !important;
  color: var(--color-mahjong-text) !important;
}

.multiselect-mahjong :deep(.multiselect-option.is-selected) {
  background-color: var(--color-mahjong-accent) !important;
  color: var(--color-mahjong-bg) !important;
}

.multiselect-mahjong :deep(.multiselect-tag) {
  background-color: var(--color-mahjong-accent) !important;
  color: var(--color-mahjong-bg) !important;
  border-color: var(--color-mahjong-accent) !important;
}

.multiselect-mahjong :deep(.multiselect-tag-remove) {
  color: var(--color-mahjong-bg) !important;
}

.multiselect-mahjong :deep(.multiselect-clear) {
  color: var(--color-mahjong-muted) !important;
}

.multiselect-mahjong :deep(.multiselect-clear:hover) {
  color: var(--color-mahjong-text) !important;
}

.multiselect-mahjong :deep(.multiselect-spinner) {
  border-color: var(--color-mahjong-muted) !important;
  border-top-color: var(--color-mahjong-accent) !important;
}

.multiselect-mahjong :deep(.multiselect-dropdown) {
  background-color: var(--color-mahjong-surface) !important;
  border-color: var(--color-mahjong-border) !important;
  box-shadow: var(--shadow-glow-blue) !important;
}

.multiselect-mahjong :deep(.multiselect__search-input) {
  color: var(--color-mahjong-text) !important;
  background-color: var(--color-mahjong-bg) !important;
  border-color: var(--color-mahjong-border) !important;
}

.multiselect-mahjong :deep(.multiselect__search-input::placeholder) {
  color: var(--color-mahjong-muted) !important;
}

/* Ensure the search wrapper also has dark background */
.multiselect-mahjong :deep(.multiselect__search) {
  background-color: var(--color-mahjong-bg) !important;
  border-color: var(--color-mahjong-border) !important;
}

/* Selected values container */
.multiselect-mahjong :deep(.multiselect__select) {
  background-color: var(--color-mahjong-bg) !important;
  border-color: var(--color-mahjong-border) !important;
}
</style>
