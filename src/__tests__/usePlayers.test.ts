import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayers } from '@/composables/usePlayers'
import { playersRepository } from '@/data/players.repository'
import { fakeReset } from '@/test-utils/fakeFirestore'
import { withColada } from '@/test-utils/colada'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

describe('T65 · usePlayers', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('expone { data, isLoading, error, refresh } y estrecha por state.status (VI.2)', async () => {
    await playersRepository.create({ externalId: 'ana', name: 'Ana' })
    await playersRepository.create({ externalId: 'bob', name: 'Bob' })

    const { result, unmount } = withColada(() => usePlayers())

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value?.map((player) => player.name)).toEqual(['Ana', 'Bob'])

      expect(result.isLoading.value).toBe(false)
      expect(result.error.value).toBeNull()
      expect(typeof result.refresh).toBe('function')
      expect(typeof result.refetch).toBe('function')
    } finally {
      unmount()
    }
  })

  it('createPlayer crea e invalida la clave raíz: la lista se refresca', async () => {
    const { result, unmount } = withColada(() => usePlayers())

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))
      expect(result.data.value).toHaveLength(0)

      const created = await result.createPlayer.mutateAsync({ externalId: 'clara', name: 'Clara' })

      expect(created.name).toBe('Clara')
      expect(created.active).toBe(true)
      await vi.waitFor(() => expect(result.data.value?.some((p) => p.id === created.id)).toBe(true))
    } finally {
      unmount()
    }
  })

  it('updatePlayer devuelve el registro actualizado y refresca la lista', async () => {
    const created = await playersRepository.create({ externalId: 'dani', name: 'Dani' })

    const { result, unmount } = withColada(() => usePlayers())

    try {
      await vi.waitFor(() => expect(result.state.value.status).toBe('success'))

      const updated = await result.updatePlayer.mutateAsync({
        id: created.id,
        patch: { name: 'Daniel' },
      })

      expect(updated.name).toBe('Daniel')
      await vi.waitFor(() =>
        expect(result.data.value?.some((p) => p.id === created.id && p.name === 'Daniel')).toBe(
          true,
        ),
      )
    } finally {
      unmount()
    }
  })

  it('removePlayer da de baja e invalida la clave raíz', async () => {
    const created = await playersRepository.create({ externalId: 'eva', name: 'Eva' })

    const { result, unmount } = withColada(() => usePlayers())

    try {
      await vi.waitFor(() => expect(result.data.value?.some((p) => p.id === created.id)).toBe(true))

      await result.removePlayer.mutateAsync(created.id)

      await vi.waitFor(() =>
        expect(result.data.value?.some((p) => p.id === created.id)).toBe(false),
      )
      expect(await playersRepository.findByExternalId('eva')).toBeNull()
    } finally {
      unmount()
    }
  })
})
