import type { IDBPDatabase } from 'idb'
import { SCHEMA_VERSION } from '../core/types'
import type {
  Activity,
  EffortBand,
  Equipment,
  Pattern,
  RecordMeta,
  Structure,
  Session,
  Settings,
  StoreSnapshot,
  Swimmer,
  Template,
  Term,
  TestSet,
  Timestamp,
  Uuid,
} from '../core/types'
import { openDatabase, type OpenDatabaseOptions } from './db'
import { SETTINGS_ID, type CatalogueStoreName, type SwimBuddyDB } from './schema'

/** The fields a caller supplies; the store owns id, timestamps and the tombstone. */
export type RecordInput<T extends RecordMeta> = Omit<T, keyof RecordMeta>

/** A patch may change anything except the record's identity and bookkeeping. */
export type RecordPatch<T extends RecordMeta> = Partial<RecordInput<T>>

export interface ReadOptions {
  /** Tombstones are hidden by default; sync and export need to see them. */
  readonly includeDeleted?: boolean
}

/**
 * Every method is declared `this: void` on purpose. These are public API, and a
 * caller may reasonably pull one off the object — `const { list } = store.swimmers`.
 * The annotation makes an implementation that leans on `this` a compile error
 * rather than a runtime one that only shows up at the point of destructuring.
 */
export interface Collection<T extends RecordMeta> {
  list(this: void, options?: ReadOptions): Promise<T[]>
  get(this: void, id: Uuid, options?: ReadOptions): Promise<T | undefined>
  create(this: void, input: RecordInput<T>): Promise<T>
  update(this: void, id: Uuid, patch: RecordPatch<T>): Promise<T>
  /** Soft delete: the row stays, flagged, so a future sync can propagate it. */
  remove(this: void, id: Uuid): Promise<T>
  /** Permanently removes the row. Only for import/wipe, never for user deletes. */
  purge(this: void, id: Uuid): Promise<void>
}

export interface SessionCollection extends Collection<Session> {
  forSwimmer(this: void, swimmerId: Uuid, options?: ReadOptions): Promise<Session[]>
}

export interface TestSetCollection extends Collection<TestSet> {
  forSwimmer(this: void, swimmerId: Uuid, options?: ReadOptions): Promise<TestSet[]>
  latestForSwimmer(this: void, swimmerId: Uuid): Promise<TestSet | undefined>
}

/**
 * Reference data, addressed by its own semantic id.
 *
 * Deliberately not a `Collection`: that generates a UUID on create, and a
 * catalogue id is the meaningful part — a parsed set refers to `free`, so the id
 * comes from the entry rather than from the store. There is no create, only an
 * upsert used by seeding and import, and a soft delete so a swimmer can hide a
 * shipped row without it being dropped.
 */
export interface CatalogueCollection<T extends Term> {
  list(this: void, options?: ReadOptions): Promise<T[]>
  get(this: void, id: string, options?: ReadOptions): Promise<T | undefined>
  /** Whole-record write, envelope included — see `Collection.put`. */
  put(this: void, entry: T): Promise<T>
  /** Soft delete, and the one write here where the store does stamp `updated_at`. */
  remove(this: void, id: string): Promise<T>
}

export interface SwimBuddyStore {
  readonly swimmers: Collection<Swimmer>
  readonly templates: Collection<Template>
  readonly sessions: SessionCollection
  readonly testSets: TestSetCollection
  readonly activities: CatalogueCollection<Activity>
  readonly equipment: CatalogueCollection<Equipment>
  readonly effortBands: CatalogueCollection<EffortBand>
  readonly patterns: CatalogueCollection<Pattern>
  readonly structures: CatalogueCollection<Structure>
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

function createCatalogue<N extends CatalogueStoreName>(
  database: IDBPDatabase<SwimBuddyDB>,
  storeName: N,
  deps: StoreDependencies,
): CatalogueCollection<SwimBuddyDB[N]['value']> {
  return {
    async list(options) {
      return visible(await database.getAll(storeName), options)
    },

    async get(id, options) {
      const entry = await database.get(storeName, id)
      if (!entry) return undefined
      if (entry.deleted && options?.includeDeleted !== true) return undefined
      return entry
    },

    async put(entry) {
      await database.put(storeName, entry)
      return entry
    },

    async remove(id) {
      const existing = await database.get(storeName, id)
      if (!existing) throw new Error(`No ${storeName} entry with id ${id}`)

      const hidden = { ...existing, deleted: true, updated_at: deps.now() }
      await database.put(storeName, hidden)
      return hidden
    },
  }
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

  const activities = createCatalogue(database, 'activities', deps)
  const equipment = createCatalogue(database, 'equipment', deps)
  const effortBands = createCatalogue(database, 'effort_bands', deps)
  const patterns = createCatalogue(database, 'patterns', deps)
  const structures = createCatalogue(database, 'structures', deps)

  const sessions: SessionCollection = {
    ...sessionBase,
    async forSwimmer(swimmerId, options) {
      const found = await database.getAllFromIndex('sessions', 'by_swimmer', swimmerId)
      return visible(found, options).sort((a, b) => a.date - b.date)
    },
  }

  // Declared as a standalone function rather than a method, so it keeps working
  // when a caller destructures it off the collection — `this` would be undefined.
  async function testSetsForSwimmer(swimmerId: Uuid, options?: ReadOptions): Promise<TestSet[]> {
    const found = await database.getAllFromIndex('test_sets', 'by_swimmer', swimmerId)
    return visible(found, options).sort((a, b) => a.date - b.date)
  }

  const testSets: TestSetCollection = {
    ...testSetBase,
    forSwimmer: testSetsForSwimmer,
    async latestForSwimmer(swimmerId) {
      const found = await testSetsForSwimmer(swimmerId)
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
    activities,
    equipment,
    effortBands,
    patterns,
    structures,
    getSettings,

    async updateSettings(patch) {
      const current = await getSettings()
      const next: Settings = { ...current, ...patch, updated_at: deps.now() }
      await database.put('settings', next)
      return next
    },

    async snapshot(options) {
      const [
        swimmerRows,
        templateRows,
        sessionRows,
        testSetRows,
        settings,
        activityRows,
        equipmentRows,
        effortRows,
        patternRows,
        structureRows,
      ] = await Promise.all([
        swimmers.list(options),
        templates.list(options),
        sessionBase.list(options),
        testSetBase.list(options),
        getSettings(),
        activities.list(options),
        equipment.list(options),
        effortBands.list(options),
        patterns.list(options),
        structures.list(options),
      ])

      return {
        version: SCHEMA_VERSION,
        swimmers: swimmerRows,
        templates: templateRows,
        sessions: sessionRows,
        test_sets: testSetRows,
        settings,
        activities: activityRows,
        equipment: equipmentRows,
        effort_bands: effortRows,
        patterns: patternRows,
        structures: structureRows,
      }
    },

    close() {
      database.close()
    },
  }
}
