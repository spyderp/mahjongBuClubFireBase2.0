/** Código de rechazo de un repositorio, mapeable a `errors.*` para i18n (AGENT.md → Errores). */
export type DataErrorCode =
  'notFound' | 'notOpen' | 'finalizedGame' | 'duplicateNumber' | 'gapInSequence'

/**
 * Error de la capa de datos. Los repositorios lanzan y `@pinia/colada` expone el `Error`;
 * el mensaje apto para el usuario sale de i18n a partir del `code`, nunca de `message`,
 * que es solo diagnóstico.
 */
export class DataError extends Error {
  readonly code: DataErrorCode

  constructor(code: DataErrorCode, message?: string) {
    super(message ?? messageOf(code))
    this.name = 'DataError'
    this.code = code
  }
}

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
  }
}
