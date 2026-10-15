type FakeTime = {
  readonly seconds: number
  readonly nanoseconds: number
}

const BASE_NOW = 1_700_000_000

let nowSeconds = BASE_NOW
let autoIdCounter = 0
let currentDb: FakeFirestore | null = null

/**
 * Réplica mínima en memoria de Firestore para los tests de `src/data/`. No implementa
 * listeners ni transmisiones: solo el subconjunto que usan los repositorios (`collection`,
 * `doc`, `query`, `getDoc`, `getDocs`, `writeBatch`, `serverTimestamp`, `Timestamp.now`).
 * El estado vive en la instancia devuelta por `fakeGetDb()`; `fakeReset()` lo descarta.
 */
class FakeFirestore {
  readonly docs = new Map<string, Record<string, unknown>>()
}

type FakeCollectionReference = {
  readonly kind: 'collection'
  readonly db: FakeFirestore
  readonly path: string
}

type FakeCollectionGroupReference = {
  readonly kind: 'collectionGroup'
  readonly db: FakeFirestore
  readonly name: string
}

type FakeDocumentReference = {
  readonly kind: 'document'
  readonly db: FakeFirestore
  readonly path: string
  readonly id: string
}

type FakeWhereClause = {
  readonly kind: 'where'
  readonly field: string
  readonly op: string
  readonly value: unknown
}

type FakeOrderClause = {
  readonly kind: 'orderBy'
  readonly field: string
  readonly direction: 'asc' | 'desc'
}

type FakeCollectionQuery = {
  readonly kind: 'query'
  readonly db: FakeFirestore
  readonly base: FakeCollectionReference | FakeCollectionGroupReference
  readonly whereClauses: readonly FakeWhereClause[]
  readonly orderClauses: readonly FakeOrderClause[]
}

type FakeWriteOp =
  | { readonly type: 'set'; readonly ref: FakeDocumentReference; readonly data: unknown }
  | { readonly type: 'update'; readonly ref: FakeDocumentReference; readonly data: unknown }
  | { readonly type: 'delete'; readonly ref: FakeDocumentReference }

const SERVER_TIMESTAMP: Readonly<{ __serverTimestamp: true }> = Object.freeze({
  __serverTimestamp: true,
})

class FakeDocumentSnapshot {
  constructor(
    readonly db: FakeFirestore,
    readonly ref: FakeDocumentReference,
  ) {}

  get id(): string {
    return lastSegment(this.ref.path)
  }

  get exists(): boolean {
    return this.db.docs.has(this.ref.path)
  }

  data(): Record<string, unknown> | undefined {
    const stored = this.db.docs.get(this.ref.path)

    return stored === undefined ? undefined : deepCopy(stored)
  }
}

class FakeQuerySnapshot {
  constructor(readonly docs: readonly FakeDocumentSnapshot[]) {}
}

class FakeWriteBatch {
  private readonly ops: FakeWriteOp[] = []

  constructor(readonly db: FakeFirestore) {}

  set(ref: FakeDocumentReference, data: unknown): this {
    this.ops.push({ type: 'set', ref, data })

    return this
  }

  update(ref: FakeDocumentReference, data: unknown): this {
    this.ops.push({ type: 'update', ref, data })

    return this
  }

  delete(ref: FakeDocumentReference): this {
    this.ops.push({ type: 'delete', ref })

    return this
  }

  commit(): Promise<void> {
    const staged = new Map<string, Record<string, unknown>>(this.db.docs)

    for (const op of this.ops) {
      if (op.type === 'delete') {
        staged.delete(op.ref.path)
        continue
      }

      const resolved = resolveTimestamps(deepCopy(op.data)) as Record<string, unknown>

      if (op.type === 'update') {
        const current = staged.get(op.ref.path)

        if (current === undefined) {
          throw new Error(`No existe el documento ${op.ref.path}`)
        }

        staged.set(op.ref.path, { ...current, ...resolved })
      } else {
        staged.set(op.ref.path, resolved)
      }
    }

    this.db.docs.clear()

    for (const [path, data] of staged) {
      this.db.docs.set(path, data)
    }

    return Promise.resolve()
  }
}

export function collection(
  _db: FakeFirestore,
  ...segments: readonly string[]
): FakeCollectionReference {
  return { kind: 'collection', db: _db, path: segments.join('/') }
}

export function collectionGroup(_db: FakeFirestore, name: string): FakeCollectionGroupReference {
  return { kind: 'collectionGroup', db: _db, name }
}

export function doc(
  source: FakeFirestore | FakeCollectionReference,
  first: string,
  ...rest: readonly string[]
): FakeDocumentReference
export function doc(source: FakeCollectionReference): FakeDocumentReference
export function doc(
  source: FakeFirestore | FakeCollectionReference,
  first?: string,
  ...rest: readonly string[]
): FakeDocumentReference {
  if (source instanceof FakeFirestore) {
    const path = [first, ...rest].join('/')

    return { kind: 'document', db: source, path, id: lastSegment(path) }
  }

  if (first === undefined) {
    const path = `${source.path}/${autoId()}`

    return { kind: 'document', db: source.db, path, id: lastSegment(path) }
  }

  const path = [source.path, first, ...rest].join('/')

  return { kind: 'document', db: source.db, path, id: lastSegment(path) }
}

export function where(field: string, op: unknown, value: unknown): FakeWhereClause {
  return { kind: 'where', field, op: String(op), value }
}

export function orderBy(field: string, direction: unknown = 'asc'): FakeOrderClause {
  return { kind: 'orderBy', field, direction: String(direction) as 'asc' | 'desc' }
}

export function query(
  base: FakeCollectionReference | FakeCollectionGroupReference,
  ...clauses: readonly (FakeWhereClause | FakeOrderClause)[]
): FakeCollectionQuery {
  return {
    kind: 'query',
    db: base.db,
    base,
    whereClauses: clauses.filter((clause): clause is FakeWhereClause => clause.kind === 'where'),
    orderClauses: clauses.filter((clause): clause is FakeOrderClause => clause.kind === 'orderBy'),
  }
}

export function getDoc(ref: FakeDocumentReference): Promise<FakeDocumentSnapshot> {
  return Promise.resolve(new FakeDocumentSnapshot(ref.db, ref))
}

export function getDocs(
  source: FakeCollectionQuery | FakeCollectionReference | FakeCollectionGroupReference,
): Promise<FakeQuerySnapshot> {
  const db = source.kind === 'query' ? source.base.db : source.db
  const refs = candidateRefs(db, source)
  const filtered = refs.filter((snapshot) =>
    whereClausesOf(source).every((clause) => passesWhere(snapshot.data(), clause)),
  )
  const orderClauses = orderClausesOf(source)

  if (orderClauses.length > 0) {
    filtered.sort(byOrderFields(orderClauses))
  }

  return Promise.resolve(new FakeQuerySnapshot(filtered))
}

export function writeBatch(db: FakeFirestore): FakeWriteBatch {
  return new FakeWriteBatch(db)
}

export function serverTimestamp(): Readonly<{ __serverTimestamp: true }> {
  return SERVER_TIMESTAMP
}

export const Timestamp = {
  now(): FakeTime {
    return { seconds: nowSeconds, nanoseconds: 0 }
  },
}

export function fakeGetDb(): FakeFirestore {
  currentDb ??= new FakeFirestore()

  return currentDb
}

export function fakeReset(): void {
  currentDb = null
  nowSeconds = BASE_NOW
  autoIdCounter = 0
}

export function fakeNow(): FakeTime {
  return { seconds: nowSeconds, nanoseconds: 0 }
}

export function fakeSetNow(seconds: number): void {
  nowSeconds = seconds
}

export function fakeAdvanceSeconds(totalSeconds: number): void {
  nowSeconds += totalSeconds
}

export type { FakeFirestore, FakeDocumentReference }
export { FakeDocumentSnapshot, FakeQuerySnapshot, FakeWriteBatch }

function candidateRefs(
  db: FakeFirestore,
  source: FakeCollectionQuery | FakeCollectionReference | FakeCollectionGroupReference,
): FakeDocumentSnapshot[] {
  const refs: FakeDocumentSnapshot[] = []

  for (const path of db.docs.keys()) {
    if (isCandidate(path, source)) {
      refs.push(new FakeDocumentSnapshot(db, documentRefFrom(db, path)))
    }
  }

  return refs
}

function isCandidate(
  path: string,
  source: FakeCollectionQuery | FakeCollectionReference | FakeCollectionGroupReference,
): boolean {
  if (source.kind === 'collection') {
    return isDirectChild(path, source.path)
  }

  if (source.kind === 'collectionGroup') {
    return collectionNameOf(path) === source.name
  }

  return source.base.kind === 'collectionGroup'
    ? collectionNameOf(path) === source.base.name
    : isDirectChild(path, source.base.path)
}

function collectionNameOf(path: string): string {
  const lastSlash = path.lastIndexOf('/')

  return lastSlash === -1 ? path : (path.slice(0, lastSlash).split('/').pop() ?? '')
}

function isDirectChild(path: string, collectionPath: string): boolean {
  if (!path.startsWith(`${collectionPath}/`)) {
    return false
  }

  const rest = path.slice(collectionPath.length + 1)

  return !rest.includes('/')
}

function documentRefFrom(db: FakeFirestore, path: string): FakeDocumentReference {
  return { kind: 'document', db, path, id: lastSegment(path) }
}

function whereClausesOf(
  source: FakeCollectionQuery | FakeCollectionReference | FakeCollectionGroupReference,
) {
  if (source.kind === 'query') {
    return source.whereClauses
  }

  return []
}

function orderClausesOf(
  source: FakeCollectionQuery | FakeCollectionReference | FakeCollectionGroupReference,
) {
  if (source.kind === 'query') {
    return source.orderClauses
  }

  return []
}

/** Orden estable: cada cláusula desempata solo cuando la anterior no lo hace. */
function byOrderFields(
  clauses: readonly FakeOrderClause[],
): (a: FakeDocumentSnapshot, b: FakeDocumentSnapshot) => number {
  return (a, b) => {
    for (const clause of clauses) {
      const comparison = compareValues(dataValue(a, clause.field), dataValue(b, clause.field))

      if (comparison !== 0) {
        return clause.direction === 'desc' ? -comparison : comparison
      }
    }

    return 0
  }
}

function passesWhere(data: Record<string, unknown> | undefined, clause: FakeWhereClause): boolean {
  const actual = data?.[clause.field]
  const comparison = compareValues(actual, clause.value)

  switch (clause.op) {
    case '==':
      return isEqualValue(actual, clause.value)
    case '!=':
      return !isEqualValue(actual, clause.value)
    case '>':
      return comparison > 0
    case '>=':
      return comparison >= 0
    case '<':
      return comparison < 0
    case '<=':
      return comparison <= 0
    default:
      return false
  }
}

function isEqualValue(a: unknown, b: unknown): boolean {
  if (isTimeShape(a) && isTimeShape(b)) {
    return compareValues(a, b) === 0
  }

  return a === b
}

function dataValue(snapshot: FakeDocumentSnapshot, field: string): unknown {
  return snapshot.data()?.[field]
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  if (isTimeShape(a) && isTimeShape(b)) {
    if (a.seconds !== b.seconds) {
      return a.seconds - b.seconds
    }

    return a.nanoseconds - b.nanoseconds
  }

  if (a === b) {
    return 0
  }

  if (a === null || a === undefined) {
    return -1
  }

  if (b === null || b === undefined) {
    return 1
  }

  return a < b ? -1 : 1
}

function isTimeShape(value: unknown): value is FakeTime {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FakeTime).seconds === 'number' &&
    typeof (value as FakeTime).nanoseconds === 'number'
  )
}

function resolveTimestamps(value: unknown): unknown {
  if (isSentinel(value)) {
    return { seconds: nowSeconds, nanoseconds: 0 }
  }

  if (Array.isArray(value)) {
    return value.map(resolveTimestamps)
  }

  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {}

    for (const key of Object.keys(value)) {
      copy[key] = resolveTimestamps((value as Record<string, unknown>)[key])
    }

    return copy
  }

  return value
}

function isSentinel(value: unknown): value is Readonly<{ __serverTimestamp: true }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __serverTimestamp?: boolean }).__serverTimestamp === true
  )
}

function autoId(): string {
  autoIdCounter += 1

  return `auto-${String(autoIdCounter).padStart(4, '0')}`
}

function lastSegment(path: string): string {
  const lastSlash = path.lastIndexOf('/')

  return lastSlash === -1 ? path : path.slice(lastSlash + 1)
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
