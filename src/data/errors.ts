/** Código de rechazo de un repositorio, mapeable a `errors.*` para i18n (AGENT.md → Errores). */
export type DataErrorCode =
  | 'notFound'
  | 'notOpen'
  | 'finalizedGame'
  | 'duplicateNumber'
  | 'gapInSequence'
  | 'conflict'
  | 'auditFull'
  | 'staleLocal'
  | 'suufonRejected'
  | 'replayInvalid'
  | 'gameMarked'
  | 'notLastTurn'

/**
 * Error de la capa de datos. Los repositorios lanzan y `@pinia/colada` expone el `Error`;
 * el mensaje apto para el usuario sale de i18n a partir del `code`, nunca de `message`,
 * que es solo diagnóstico.
 *
 * `details` lleva lo que el mensaje necesita para ser concreto —el número del turno que invalida una
 * operación— porque `message` no se muestra y ese dato no puede viajar dentro de él.
 */
export class DataError extends Error {
  readonly code: DataErrorCode
  readonly details: Readonly<Record<string, string>>

  constructor(
    code: DataErrorCode,
    message?: string,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message ?? messageOf(code))
    this.name = 'DataError'
    this.code = code
    this.details = details
  }
}

/**
 * T33 · RF-19.12, RF-19.14, RF-19.15, RF-21.5. La clave i18n de cada código, y **solo** la clave: el
 * mensaje sale de aquí y no de `Error.message`, que es diagnóstico (AGENT.md → Errores). Es un
 * `Record` completo a propósito —no un `Partial`— porque un código sin clave no falla al compilar:
 * se ve en la mesa como una ruta de i18n en pantalla.
 */
export const ERROR_KEYS: Record<DataErrorCode, string> = {
  notFound: 'errors.game.notFound',
  notOpen: 'errors.game.notOpen',
  finalizedGame: 'errors.game.finalizedGame',
  duplicateNumber: 'errors.turn.duplicateNumber',
  gapInSequence: 'errors.turn.gapInSequence',
  conflict: 'errors.turn.conflict',
  auditFull: 'errors.turn.auditFull',
  staleLocal: 'errors.turn.staleLocal',
  suufonRejected: 'errors.turn.suufonRejected',
  replayInvalid: 'errors.turn.replayInvalid',
  gameMarked: 'errors.turn.gameMarked',
  notLastTurn: 'errors.turn.notLastTurn',
}

/**
 * El `switch` es exhaustivo y sin `default`: añadir un código a `DataErrorCode` sin decidir su
 * mensaje rompe el typecheck en vez de dejar que el rechazo salga con el `message` vacío.
 *
 * Los siete últimos son de `specs/002`: `conflict` y `auditFull` los lanza `turnsRepository`
 * (RF-19.12 y RF-19.14), `staleLocal` el estado desfasado de una partida abierta sin conexión
 * (RF-19.15), `suufonRejected` el *suufon renta*, vetado por decisión del club (RF-21.5),
 * `replayInvalid` una partida que `domain/replay.ts` no puede reproducir (RF-18.16) y `gameMarked`
 * y `notLastTurn` la partida marcada por bancarrota y su única operación permitida (RF-18.18).
 */
function messageOf(code: DataErrorCode): string {
  switch (code) {
    case 'notFound':
      return 'El documento solicitado no existe'
    case 'notOpen':
      return 'La partida o temporada no está abierta'
    case 'finalizedGame':
      return 'Una partida finalizada solo admite deshacer la finalización'
    case 'duplicateNumber':
      return 'El número de turno ya está registrado'
    case 'gapInSequence':
      return 'El número de turno deja huecos en la secuencia'
    case 'conflict':
      return 'El turno cambió mientras se corregía: vuelve a leerlo e inténtalo otra vez'
    case 'auditFull':
      return 'El registro del turno ha alcanzado su límite y no admite más correcciones'
    case 'staleLocal':
      return 'Esta partida ha cambiado en otro sitio: sincroniza antes de volver a corregir'
    case 'suufonRejected':
      return 'Una mano por tsumo no puede tener cuatro ganadores'
    case 'replayInvalid':
      return 'La partida no se puede recalcular porque algún turno guardado no es reproducible'
    case 'gameMarked':
      return 'La partida está marcada por bancarrota: solo se puede finalizar'
    case 'notLastTurn':
      return 'De una partida marcada por bancarrota solo se puede borrar el último turno'
  }
}
