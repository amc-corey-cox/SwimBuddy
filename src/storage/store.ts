import type { IDBPDatabase } from 'idb'
import { SCHEMA_VERSION } from '../core/types'
import type {
  RecordMeta,
  Session,
  Settings,
  StoreSnapshot,
  Swimmer,
  Template,
  TestSet,
  Timestamp,
  Uuid,
} from '../core/types'
import { openDatabase, type OpenDatabaseOptions } from './db'
import { SETTINGS_ID, type SwimBuddyDB } from './schema'

/** The fields a caller supplies; the store owns id, timestamps and the tombstone. */
export type RecordInput<T extends RecordMeta> = Omit<T, keyof RecordMeta>

/** A patch may change anything except the record's identity and bookkeeping. */
export type RecordPatch<T extends RecordMeta> = Partial<RecordInput<T>>

export interface ReadOptions {
  /** Tombstones are hidden by default; sync and export need to see them. */
  readonly includeDeleted?: boolean
}

export interface Collection<T extends RecordMeta> {
  list(options?: ReadOptions): Promise<T[]>
  get(id: Uuid, options?: ReadOptions): Promise<T | undefined>
  create(input: RecordInput<T>): Promise<T>
  update(id: Uuid, patch: RecordPatch<T>): Promise<T>
  /** Soft delete: the row stays, flagged, so a future sync can propagate it. */
  remove(id: Uuid): Promise<T>
  /** Permanently removes the row. Only for import/wipe, never for user deletes. */
  purge(id: Uuid): Promise<void>
}

export interface SessionCollection extends Collection<Session> {
  forSwimmer(swimmerId: Uuid, options?: ReadOptions): Promise<Session[]>
}

export interface TestSetCollection extends Collection<TestSet> {
  forSwimmer(swimmerId: Uuid, options?: ReadOptions): Promise<TestSet[]>
  latestForSwimmer(swimmerId: Uuid): Promise<TestSet | undefined>
}

export interface SwimBuddyStore {
  readonly swimmers: Collection<Swimmer>
  readonly templates: Collection<Template>
  readonly sessions: SessionCollection
  readonly testSets: TestSetCollection
  getSettings(): Promise<Settings>
  updateSettings(patch: RecordPatch<Settings>): Promise<Settings>
  /** The whole store, in the shape of the JSON export file (build order step 8). */
  snapshot(options?: ReadOptions): Promise<StoreSnapshot>
  close(): void
}

/**
 * Injected so tests get deterministic records. Production uses the real clock
 * and `crypto.randomUUID`, which exists in browsers and in Node 19+.
 */
export interface StoreDependencies {
  now: () => Timestamp
  newId: () => Uuid
}

export const defaultDependencies: StoreDependencies = {
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
}

export const DEFAULT_SETTINGS: Omit<Settings, keyof RecordMeta> = {
  pool_unit: 'yards',
  pool_length: 25,
}

type RecordStoreName = 'swimmers' | 'templates' | 'sessions' | 'test_sets'

function visible<T extends RecordMeta>(records: T[], options?: ReadOptions): T[] {
  if (options?.includeDeleted === true) return records
  return records.filter((record) => !record.deleted)
}

function createCollection<N extends RecordStoreName>(
  database: IDBPDatabase<SwimBuddyDB>,
  storeName: N,
  deps: StoreDependencies,
): Collection<SwimBuddyDB[N]['value']> {
  type T = SwimBuddyDB[N]['value']

  async function require(id: Uuid): Promise<T> {
    const existing = await database.get(storeName, id)
    if (!existing) throw new Error(`No ${storeName} record with id ${id}`)
    return existing
  }

  return {
    async list(options) {
      return visible(await database.getAll(storeName), options)
    },

    async get(id, options) {
      const record = await database.get(storeName, id)
      if (!record) return undefined
      if (record.deleted && options?.includeDeleted !== true) return undefined
      return record
    },

    async create(input) {
      const timestamp = deps.now()
      // Omit<T, keyof RecordMeta> plus RecordMeta is T, which the compiler
      // cannot prove for a generic T. Contained to this one line.
      const record = {
        ...input,
        id: deps.newId(),
        created_at: timestamp,
        updated_at: timestamp,
        deleted: false,
      } as T
      await database.put(storeName, record)
      return record
    },

    async update(id, patch) {
      const existing = await require(id)
      const record = { ...existing, ...patch, updated_at: deps.now() } as T
      await database.put(storeName, record)
      return record
    },

    async remove(id) {
      const existing = await require(id)
      if (existing.deleted) return existing
      const record = { ...existing, deleted: true, updated_at: deps.now() } as T
      await database.put(storeName, record)
      return record
    },

    async purge(id) {
      await database.delete(storeName, id)
    },
  }
}

export interface OpenStoreOptions extends OpenDatabaseOptions {
  readonly dependencies?: StoreDependencies
}

export async function openStore(options: OpenStoreOptions = {}): Promise<SwimBuddyStore> {
  const deps = options.dependencies ?? defaultDependencies
  const database = await openDatabase(options)

  const swimmers = createCollection(database, 'swimmers', deps)
  const templates = createCollection(database, 'templates', deps)
  const sessionBase = createCollection(database, 'sessions', deps)
  const testSetBase = createCollection(database, 'test_sets', deps)

  const sessions: SessionCollection = {
    ...sessionBase,
    async forSwimmer(swimmerId, options) {
      const found = await database.getAllFromIndex('sessions', 'by_swimmer', swimmerId)
      return visible(found, options).sort((a, b) => a.date - b.date)
    },
  }

  const testSets: TestSetCollection = {
    ...testSetBase,
    async forSwimmer(swimmerId, options) {
      const found = await database.getAllFromIndex('test_sets', 'by_swimmer', swimmerId)
      return visible(found, options).sort((a, b) => a.date - b.date)
    },
    async latestForSwimmer(swimmerId) {
      const found = await this.forSwimmer(swimmerId)
      return found.at(-1)
    },
  }

  async function getSettings(): Promise<Settings> {
    const stored = await database.get('settings', SETTINGS_ID)
    if (stored) return stored

    // Not yet seeded. Return the defaults rather than throwing or writing from
    // a read path; updateSettings persists them on first change.
    const timestamp = deps.now()
    return {
      ...DEFAULT_SETTINGS,
      id: SETTINGS_ID,
      created_at: timestamp,
      updated_at: timestamp,
      deleted: false,
    }
  }

  return {
    swimmers,
    templates,
    sessions,
    testSets,
    getSettings,

    async updateSettings(patch) {
      const current = await getSettings()
      const next: Settings = { ...current, ...patch, updated_at: deps.now() }
      await database.put('settings', next)
      return next
    },

    async snapshot(options) {
      const [swimmerRows, templateRows, sessionRows, testSetRows, settings] = await Promise.all([
        swimmers.list(options),
        templates.list(options),
        sessionBase.list(options),
        testSetBase.list(options),
        getSettings(),
      ])

      return {
        version: SCHEMA_VERSION,
        swimmers: swimmerRows,
        templates: templateRows,
        sessions: sessionRows,
        test_sets: testSetRows,
        settings,
      }
    },

    close() {
      database.close()
    },
  }
}
