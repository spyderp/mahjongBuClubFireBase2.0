import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { DataError } from '@/data/errors'
import { playersRepository } from '@/data/players.repository'
import { toPlayerId } from '@/domain/types'
import { fakeAdvanceSeconds, fakeNow, fakeReset } from '@/test-utils/fakeFirestore'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

async function storedDoc(id: string): Promise<Record<string, unknown> | undefined> {
  const snapshot = await getDoc(doc(getDb(), 'players', id))
  const data = snapshot.data()
  const record: Record<string, unknown> | undefined = data

  return record
}

describe('T60 · players.repository', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('create devuelve el jugador e inicializa active y los sellos de tiempo', async () => {
    const record = await playersRepository.create({ externalId: 'mb-123', name: 'Ana' })

    expect(record.id.length).toBeGreaterThan(0)
    expect(record.externalId).toBe('mb-123')
    expect(record.name).toBe('Ana')
    expect(record.active).toBe(true)
    expect(record.createdAt).toEqual(fakeNow())
  })

  it('create persiste solo los cinco campos: no escribe contadores derivados', async () => {
    const record = await playersRepository.create({ externalId: 'mb-123', name: 'Ana' })
    const stored = (await storedDoc(record.id)) ?? {}

    expect(Object.keys(stored).sort()).toEqual([
      'active',
      'createdAt',
      'externalId',
      'guest',
      'name',
      'updatedAt',
    ])
    expect(stored).not.toHaveProperty('gamesPlayed')
    expect(stored).not.toHaveProperty('positions')
    expect(stored).not.toHaveProperty('yakuStats')
  })

  it('list ordena por nombre', async () => {
    await playersRepository.create({ externalId: 'mb-002', name: 'Bruno' })
    await playersRepository.create({ externalId: 'mb-001', name: 'Ana' })

    const players = await playersRepository.list()

    expect(players.map((player) => player.name)).toEqual(['Ana', 'Bruno'])
  })

  it('findByExternalId devuelve el jugador o null', async () => {
    const ana = await playersRepository.create({ externalId: 'mb-123', name: 'Ana' })

    expect((await playersRepository.findByExternalId('mb-123'))?.id).toBe(ana.id)
    expect(await playersRepository.findByExternalId('mb-999')).toBeNull()
  })

  it('update aplica name, externalId y active y refresca updatedAt', async () => {
    const created = await playersRepository.create({ externalId: 'mb-123', name: 'Ana' })

    fakeAdvanceSeconds(120)

    const updated = await playersRepository.update(created.id, {
      name: 'Ana García',
      externalId: 'mb-999',
      active: false,
    })

    expect(updated.name).toBe('Ana García')
    expect(updated.externalId).toBe('mb-999')
    expect(updated.active).toBe(false)
    expect(updated.updatedAt.seconds).toBeGreaterThan(created.updatedAt.seconds)

    const stored = await storedDoc(created.id)

    expect(stored?.name).toBe('Ana García')
    expect(stored?.externalId).toBe('mb-999')
    expect(stored?.active).toBe(false)
  })

  it('update de un jugador inexistente lanza DataError notFound', async () => {
    const error = await playersRepository
      .update(toPlayerId('no-existe'), { name: 'Ana' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).code).toBe('notFound')
  })

  it('remove borra el documento y es idempotente', async () => {
    const created = await playersRepository.create({ externalId: 'mb-123', name: 'Ana' })

    await playersRepository.remove(created.id)

    expect(await playersRepository.list()).toHaveLength(0)
    await expect(playersRepository.remove(created.id)).resolves.toBeUndefined()
  })

  /**
   * RF-1.3 y RF-1.4: el invitado se guarda en la misma colección que el club y con el mismo
   * identificador normalizado, así que volver a capturar su identificador lo reconoce como la
   * misma persona en vez de crear un jugador nuevo con el historial en cero.
   */
  it('un invitado creado conserva su identidad al volver por el mismo identificador (RF-1.3, RF-1.4)', async () => {
    const first = await playersRepository.create({
      externalId: 'inv-01',
      name: 'Invitado',
      guest: true,
    })

    expect(first.guest).toBe(true)

    const again = await playersRepository.findByExternalId('inv-01')

    expect(again?.id).toBe(first.id)
    expect(again?.guest).toBe(true)
  })

  it('un jugador del club no nace invitado y listClub lo excluye a los invitados (RF-1.3)', async () => {
    await playersRepository.create({ externalId: 'mb-001', name: 'Ana' })
    await playersRepository.create({ externalId: 'inv-01', name: 'Invitado', guest: true })

    expect(await playersRepository.list()).toHaveLength(2)
    expect((await playersRepository.listClub()).map((player) => player.externalId)).toEqual([
      'mb-001',
    ])
  })

  /**
   * RF-1.5: promover es pasar `guest` a `false` sobre el mismo documento. Como las estadísticas
   * se indexan por `playerId`, el historial no se toca ni se migra.
   */
  it('promover a un invitado conserva el mismo id y su historial (RF-1.5)', async () => {
    const guest = await playersRepository.create({
      externalId: 'inv-01',
      name: 'Invitado',
      guest: true,
    })

    const promoted = await playersRepository.update(guest.id, { guest: false })

    expect(promoted.id).toBe(guest.id)
    expect(promoted.guest).toBe(false)
    expect(promoted.createdAt).toEqual(guest.createdAt)
    expect((await playersRepository.listClub()).map((player) => player.id)).toEqual([guest.id])
  })
})
