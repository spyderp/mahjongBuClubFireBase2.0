import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc } from 'firebase/firestore'
import { getDb } from '@/app/firebase'
import { DataError } from '@/data/errors'
import { seasonsRepository } from '@/data/seasons.repository'
import { toSeasonId } from '@/domain/types'
import { fakeAdvanceSeconds, fakeNow, fakeReset } from '@/test-utils/fakeFirestore'

vi.mock('firebase/firestore', () => import('@/test-utils/fakeFirestore'))
vi.mock('@/app/firebase', async () => {
  const { fakeGetDb } = await import('@/test-utils/fakeFirestore')

  return { getDb: fakeGetDb }
})

const DAY = 86400

function atDay(day: number): { seconds: number; nanoseconds: number } {
  return { seconds: day * DAY, nanoseconds: 0 }
}

async function storedDoc(id: string): Promise<Record<string, unknown> | undefined> {
  const snapshot = await getDoc(doc(getDb(), 'seasons', id))
  const data = snapshot.data()
  const record: Record<string, unknown> | undefined = data

  return record
}

describe('T61 · seasons.repository', () => {
  beforeEach(() => {
    fakeReset()
  })

  it('create devuelve la temporada y por defecto la abre', async () => {
    const record = await seasonsRepository.create({
      title: 'Temporada de otoño',
      dateFrom: atDay(1),
      dateTo: atDay(30),
    })

    expect(record.id.length).toBeGreaterThan(0)
    expect(record.title).toBe('Temporada de otoño')
    expect(record.dateFrom).toEqual(atDay(1))
    expect(record.dateTo).toEqual(atDay(30))
    expect(record.status).toBe('open')
    expect(record.createdAt).toEqual(fakeNow())
  })

  it('create respeta el estado explícito', async () => {
    const record = await seasonsRepository.create({
      title: 'Cerrada por adelantado',
      dateFrom: atDay(1),
      dateTo: atDay(10),
      status: 'closed',
    })

    expect(record.status).toBe('closed')
  })

  it('list ordena por fecha de inicio', async () => {
    await seasonsRepository.create({ title: 'Última', dateFrom: atDay(30), dateTo: atDay(40) })
    await seasonsRepository.create({ title: 'Primera', dateFrom: atDay(1), dateTo: atDay(10) })

    const seasons = await seasonsRepository.list()

    expect(seasons.map((season) => season.title)).toEqual(['Primera', 'Última'])
  })

  it('update aplica título y rango y refresca updatedAt', async () => {
    const created = await seasonsRepository.create({
      title: 'Antes',
      dateFrom: atDay(1),
      dateTo: atDay(10),
    })

    fakeAdvanceSeconds(60)

    const updated = await seasonsRepository.update(created.id, {
      title: 'Después',
      dateFrom: atDay(2),
      dateTo: atDay(12),
    })

    expect(updated.title).toBe('Después')
    expect(updated.dateFrom).toEqual(atDay(2))
    expect(updated.dateTo).toEqual(atDay(12))
    expect(updated.updatedAt.seconds).toBeGreaterThan(created.updatedAt.seconds)

    const stored = await storedDoc(created.id)

    expect(stored?.title).toBe('Después')
  })

  it('update de una temporada inexistente lanza DataError notFound', async () => {
    const error = await seasonsRepository
      .update(toSeasonId('no-existe'), { title: 'X' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).code).toBe('notFound')
  })

  /**
   * RF-0.6: `canUpdateRange` solo la ejecutaba `seasons.test.ts`, así que el repositorio
   * aceptaba mover el rango de una temporada cerrada. Estos tests comprueban la barrera real.
   */
  it('update del rango de una temporada cerrada lanza DataError notOpen (RF-0.6)', async () => {
    const created = await seasonsRepository.create({
      title: 'Cerrada',
      dateFrom: atDay(1),
      dateTo: atDay(10),
    })
    await seasonsRepository.close(created.id)

    const error = await seasonsRepository
      .update(created.id, { dateFrom: atDay(2) })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DataError)
    expect((error as DataError).code).toBe('notOpen')
    expect((await storedDoc(created.id))?.dateFrom).toEqual(atDay(1))
  })

  it('update del rango de una temporada cerrada también se rechaza moviendo dateTo', async () => {
    const created = await seasonsRepository.create({
      title: 'Cerrada',
      dateFrom: atDay(1),
      dateTo: atDay(10),
    })
    await seasonsRepository.close(created.id)

    const error = await seasonsRepository
      .update(created.id, { dateTo: atDay(30) })
      .catch((caught: unknown) => caught)

    expect((error as DataError).code).toBe('notOpen')
    expect((await storedDoc(created.id))?.dateTo).toEqual(atDay(10))
  })

  it('update del título de una temporada cerrada sí se admite (RF-0.6)', async () => {
    const created = await seasonsRepository.create({
      title: 'Nombre viejo',
      dateFrom: atDay(1),
      dateTo: atDay(10),
    })
    await seasonsRepository.close(created.id)

    const updated = await seasonsRepository.update(created.id, { title: 'Nombre corregido' })

    expect(updated.title).toBe('Nombre corregido')
    expect(updated.dateFrom).toEqual(atDay(1))
    expect(updated.dateTo).toEqual(atDay(10))
    expect(updated.status).toBe('closed')
  })

  it('close cierra la temporada', async () => {
    const created = await seasonsRepository.create({
      title: 'T1',
      dateFrom: atDay(1),
      dateTo: atDay(10),
    })

    const closed = await seasonsRepository.close(created.id)

    expect(closed.status).toBe('closed')
    expect((await storedDoc(created.id))?.status).toBe('closed')
  })

  it('findByDateRange devuelve las temporadas cuyo rango contiene la fecha, inclusive', async () => {
    await seasonsRepository.create({ title: 'T1', dateFrom: atDay(1), dateTo: atDay(10) })
    await seasonsRepository.create({ title: 'T2', dateFrom: atDay(20), dateTo: atDay(30) })

    expect((await seasonsRepository.findByDateRange(atDay(1))).map((s) => s.title)).toEqual(['T1'])
    expect((await seasonsRepository.findByDateRange(atDay(10))).map((s) => s.title)).toEqual(['T1'])
    expect((await seasonsRepository.findByDateRange(atDay(25))).map((s) => s.title)).toEqual(['T2'])
    expect(await seasonsRepository.findByDateRange(atDay(15))).toHaveLength(0)
  })

  it('findOverlapping devuelve las temporadas que se tocan con el candidato', async () => {
    await seasonsRepository.create({ title: 'T1', dateFrom: atDay(1), dateTo: atDay(10) })
    await seasonsRepository.create({ title: 'T2', dateFrom: atDay(20), dateTo: atDay(30) })

    expect(
      (await seasonsRepository.findOverlapping(atDay(10), atDay(15))).map((s) => s.title),
    ).toEqual(['T1'])
    expect(
      (await seasonsRepository.findOverlapping(atDay(0), atDay(5))).map((s) => s.title),
    ).toEqual(['T1'])
    expect(await seasonsRepository.findOverlapping(atDay(40), atDay(50))).toHaveLength(0)
  })

  it('las consultas de rango llevan el comentario del índice compuesto', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/data/seasons.repository.ts'), 'utf8')

    expect(source).toContain('seasons (dateFrom ASC, dateTo ASC)')
  })
})
