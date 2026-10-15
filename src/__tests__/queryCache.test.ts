import { beforeEach, describe, expect, it } from 'vitest'
import { appNotice, onQueryError } from '@/app/queryCache'

/** Error de Firebase tal y como lo lanza el SDK: `code` más un mensaje largo. */
function firebaseError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

describe('T1 · queryCache muestra el motivo del fallo en desarrollo', () => {
  beforeEach(() => {
    appNotice.value = null
  })

  it('usa la clave de meta.errorMessage de la consulta', () => {
    onQueryError(firebaseError('failed-precondition', 'The query requires an index'), {
      meta: { errorMessage: 'errors.load.games' },
    })

    expect(appNotice.value?.kind).toBe('error')
    expect(appNotice.value?.message).toBe('errors.load.games')
  })

  it('cae en una clave genérica si la consulta no declara meta', () => {
    onQueryError(new Error('boom'), {})

    expect(appNotice.value?.message).toBe('errors.load.games')
  })

  it('ignora un errorMessage que no es texto', () => {
    onQueryError(new Error('boom'), { meta: { errorMessage: 42 } })

    expect(appNotice.value?.message).toBe('errors.load.games')
  })

  /**
   * Sin esto, «No se pudieron cargar las partidas» no distingue un índice que falta de un
   * permiso denegado, y el diagnóstico obliga a abrir la consola del navegador cada vez.
   */
  it('añade el código y el mensaje del SDK al detalle', () => {
    onQueryError(firebaseError('failed-precondition', 'The query requires an index'), {
      meta: { errorMessage: 'errors.load.games' },
    })

    expect(appNotice.value?.detail).toContain('failed-precondition')
    expect(appNotice.value?.detail).toContain('The query requires an index')
  })

  it('distingue un permiso denegado de un índice ausente', () => {
    onQueryError(firebaseError('permission-denied', 'Missing or insufficient permissions.'), {
      meta: { errorMessage: 'errors.load.games' },
    })

    expect(appNotice.value?.detail).toContain('permission-denied')
  })

  it('tolera excepciones sin código ni mensaje', () => {
    onQueryError('texto plano', { meta: { errorMessage: 'errors.load.players' } })

    expect(appNotice.value?.kind).toBe('error')
    expect(appNotice.value?.message).toBe('errors.load.players')
    expect(appNotice.value?.detail).not.toContain('undefined')
  })
})
