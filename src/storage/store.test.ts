import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Session, Swimmer, Uuid } from '../core/types'
import { SCHEMA_VERSION } from '../core/types'
import { openStore, type StoreDependencies, type SwimBuddyStore } from './store'
import { DATABASE_VERSION, MIGRATIONS, type Migration } from './schema'
import { openDatabase } from './db'

/**
 * These run against fake-indexeddb rather than a stub, so the real idb code
 * paths, key paths and indexes are exercised. Development happens in a sandbox
 * with no browser, so this is the only thing standing between a schema mistake
 * and the phone.
 */

const START = Date.UTC(2026, 0, 15, 12, 0, 0)

/** Deterministic clock and ids, so assertions can be exact. */
function testDependencies(): StoreDependencies {
  let tick = 0
  let counter = 0
  return {
    now: () => START + tick++ * 1000,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  }
}

let databaseCounter = 0
async function freshStore(migrations?: readonly Migration[]): Promise<SwimBuddyStore> {
  return openStore({
    name: `swim-buddy-test-${String(++databaseCounter)}`,
    dependencies: testDependencies(),
    ...(migrations ? { migrations } : {}),
  })
}

const aSwimmer = {
  name: 'Test Swimmer',
  base_pace_by_stroke: { free: 100 },
  load_factor: 1.0,
  is_youth: false,
} as const

let store: SwimBuddyStore

beforeEach(async () => {
  store = await freshStore()
})

describe('record envelope', () => {
  it('assigns an id, timestamps and a tombstone flag on create', async () => {
    const swimmer = await store.swimmers.create({ ...aSwimmer })

    expect(swimmer.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(swimmer.created_at).toBe(START)
    expect(swimmer.updated_at).toBe(START)
    expect(swimmer.deleted).toBe(false)
  })

  it('bumps updated_at on update but never created_at', async () => {
    const created = await store.swimmers.create({ ...aSwimmer })
    const updated = await store.swimmers.update(created.id, { load_factor: 1.1 })

    expect(updated.created_at).toBe(created.created_at)
    expect(updated.updated_at).toBeGreaterThan(created.updated_at)
    expect(updated.load_factor).toBe(1.1)
    expect(updated.id).toBe(created.id)
  })

  it('never lets a patch overwrite identity or bookkeeping', async () => {
    const created = await store.swimmers.create({ ...aSwimmer })
    // @ts-expect-error id is not part of RecordPatch — asserting the type guards it.
    await store.swimmers.update(created.id, { id: 'hijacked' })

    const found = await store.swimmers.get(created.id)
    expect(found?.id).toBe(created.id)
  })

  it('returns undefined for an id that was never stored', async () => {
    expect(await store.swimmers.get('00000000-0000-4000-8000-00000000dead')).toBeUndefined()
  })

  it('throws a useful error when updating a record that does not exist', async () => {
    await expect(store.swimmers.update('missing-id', { load_factor: 1 })).rejects.toThrow(
      /No swimmers record with id missing-id/,
    )
  })
})

describe('soft delete', () => {
  let swimmer: Swimmer

  beforeEach(async () => {
    swimmer = await store.swimmers.create({ ...aSwimmer })
    await store.swimmers.remove(swimmer.id)
  })

  it('keeps the row so a future sync can propagate the delete', async () => {
    const withDeleted = await store.swimmers.list({ includeDeleted: true })
    expect(withDeleted).toHaveLength(1)
    expect(withDeleted[0]?.deleted).toBe(true)
  })

  it('hides it from normal reads', async () => {
    expect(await store.swimmers.list()).toEqual([])
    expect(await store.swimmers.get(swimmer.id)).toBeUndefined()
  })

  it('still returns it when explicitly asked for', async () => {
    const found = await store.swimmers.get(swimmer.id, { includeDeleted: true })
    expect(found?.id).toBe(swimmer.id)
  })

  it('is idempotent and does not re-stamp updated_at', async () => {
    const first = await store.swimmers.get(swimmer.id, { includeDeleted: true })
    const second = await store.swimmers.remove(swimmer.id)
    expect(second.updated_at).toBe(first?.updated_at)
  })

  it('purge really removes the row, unlike remove', async () => {
    await store.swimmers.purge(swimmer.id)
    expect(await store.swimmers.list({ includeDeleted: true })).toEqual([])
  })
})

describe('sessions', () => {
  let alice: Swimmer
  let bob: Swimmer

  async function addSession(swimmerId: Uuid, date: number, distance: number): Promise<Session> {
    return store.sessions.create({
      swimmer_id: swimmerId,
      template_id: '00000000-0000-4000-8000-00000000ffff',
      date,
      total_distance: distance,
      effort_rating: 'about_right',
      completed: true,
      notes: '',
    })
  }

  beforeEach(async () => {
    alice = await store.swimmers.create({ ...aSwimmer, name: 'Alice' })
    bob = await store.swimmers.create({ ...aSwimmer, name: 'Bob' })

    await addSession(bob.id, START, 1000)
    await addSession(alice.id, START + 2000, 2000)
    await addSession(alice.id, START + 1000, 1500)
  })

  it('returns only the requested swimmer, in date order', async () => {
    const found = await store.sessions.forSwimmer(alice.id)

    expect(found.map((session) => session.total_distance)).toEqual([1500, 2000])
    expect(found.every((session) => session.swimmer_id === alice.id)).toBe(true)
  })

  it('excludes tombstoned sessions from the index query', async () => {
    const [first] = await store.sessions.forSwimmer(alice.id)
    await store.sessions.remove(first!.id)

    expect(await store.sessions.forSwimmer(alice.id)).toHaveLength(1)
    expect(await store.sessions.forSwimmer(alice.id, { includeDeleted: true })).toHaveLength(2)
  })

  it('returns nothing for a swimmer with no sessions', async () => {
    const stranger = await store.swimmers.create({ ...aSwimmer, name: 'Stranger' })
    expect(await store.sessions.forSwimmer(stranger.id)).toEqual([])
  })
})

describe('test sets', () => {
  it('finds the most recent one for a swimmer', async () => {
    const swimmer = await store.swimmers.create({ ...aSwimmer })
    const base = {
      swimmer_id: swimmer.id,
      protocol: '400/200' as const,
      t400: 370,
      t200: 180,
      computed_base_pace: 95,
    }

    await store.testSets.create({ ...base, date: START })
    await store.testSets.create({ ...base, date: START + 10_000, computed_base_pace: 92 })
    await store.testSets.create({ ...base, date: START + 5000, computed_base_pace: 93 })

    const latest = await store.testSets.latestForSwimmer(swimmer.id)
    expect(latest?.computed_base_pace).toBe(92)
  })

  it('returns undefined when the swimmer has never been tested', async () => {
    const swimmer = await store.swimmers.create({ ...aSwimmer })
    expect(await store.testSets.latestForSwimmer(swimmer.id)).toBeUndefined()
  })
})

describe('collection methods survive being destructured', () => {
  it('latestForSwimmer works when pulled off the collection', async () => {
    const swimmer = await store.swimmers.create({ ...aSwimmer })
    await store.testSets.create({
      swimmer_id: swimmer.id,
      date: START,
      protocol: '400/200',
      t400: 370,
      t200: 180,
      computed_base_pace: 95,
    })

    // Public API: a caller may reasonably destructure it, and `this` would be
    // undefined if the implementation leaned on it.
    const { latestForSwimmer } = store.testSets
    expect((await latestForSwimmer(swimmer.id))?.computed_base_pace).toBe(95)
  })

  it('forSwimmer works when pulled off either collection', async () => {
    const swimmer = await store.swimmers.create({ ...aSwimmer })
    const sessionsFor = store.sessions.forSwimmer
    const testSetsFor = store.testSets.forSwimmer

    expect(await sessionsFor(swimmer.id)).toEqual([])
    expect(await testSetsFor(swimmer.id)).toEqual([])
  })
})

describe('settings', () => {
  it('returns the spec defaults before anything is stored', async () => {
    const settings = await store.getSettings()
    expect(settings.pool_unit).toBe('yards')
    expect(settings.pool_length).toBe(25)
  })

  it('does not write to the database from the read path', async () => {
    await store.getSettings()
    const snapshot = await store.snapshot()
    // Settings are reported, but nothing was persisted by reading.
    expect(snapshot.settings.pool_unit).toBe('yards')
  })

  it('persists a change and keeps the singleton id', async () => {
    const first = await store.updateSettings({ pool_unit: 'meters', pool_length: 50 })
    const reread = await store.getSettings()

    expect(reread.pool_unit).toBe('meters')
    expect(reread.pool_length).toBe(50)
    expect(reread.id).toBe(first.id)
  })
})

describe('default dependencies (the production clock and id source)', () => {
  it('mints real UUIDv4s and real timestamps when nothing is injected', async () => {
    const before = Date.now()
    const real = await openStore({ name: `swim-buddy-real-deps-${String(++databaseCounter)}` })
    const swimmer = await real.swimmers.create({ ...aSwimmer })
    const after = Date.now()
    real.close()

    expect(swimmer.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(swimmer.created_at).toBeGreaterThanOrEqual(before)
    expect(swimmer.created_at).toBeLessThanOrEqual(after)
  })

  it('does not hand out the same id twice', async () => {
    const real = await openStore({ name: `swim-buddy-real-ids-${String(++databaseCounter)}` })
    const first = await real.swimmers.create({ ...aSwimmer })
    const second = await real.swimmers.create({ ...aSwimmer })
    real.close()

    expect(first.id).not.toBe(second.id)
  })
})

describe('persistence across reopen', () => {
  it('survives closing and reopening the database', async () => {
    const name = `swim-buddy-reopen-${String(++databaseCounter)}`

    const first = await openStore({ name, dependencies: testDependencies() })
    const swimmer = await first.swimmers.create({ ...aSwimmer, name: 'Persisted' })
    await first.updateSettings({ pool_unit: 'meters' })
    first.close()

    const second = await openStore({ name, dependencies: testDependencies() })
    const found = await second.swimmers.get(swimmer.id)
    const settings = await second.getSettings()
    second.close()

    expect(found?.name).toBe('Persisted')
    expect(settings.pool_unit).toBe('meters')
  })
})

describe('snapshot', () => {
  it('reports every store plus the schema version', async () => {
    await store.swimmers.create({ ...aSwimmer })
    const snapshot = await store.snapshot()

    expect(snapshot.version).toBe(SCHEMA_VERSION)
    expect(snapshot.swimmers).toHaveLength(1)
    expect(snapshot.templates).toEqual([])
    expect(snapshot.sessions).toEqual([])
    expect(snapshot.test_sets).toEqual([])
    expect(snapshot.settings.pool_unit).toBe('yards')
    // Empty until seeded, but present: an export missing the catalogues would
    // import as a store whose templates point at activities nobody has.
    expect(snapshot.activities).toEqual([])
    expect(snapshot.equipment).toEqual([])
    expect(snapshot.effort_bands).toEqual([])
    expect(snapshot.patterns).toEqual([])
    expect(snapshot.structures).toEqual([])
  })

  it('omits tombstones by default and includes them on request', async () => {
    const swimmer = await store.swimmers.create({ ...aSwimmer })
    await store.swimmers.remove(swimmer.id)

    expect((await store.snapshot()).swimmers).toEqual([])
    expect((await store.snapshot({ includeDeleted: true })).swimmers).toHaveLength(1)
  })
})

describe('migrations run against a real database', () => {
  it('creates every store and index the migrations describe', async () => {
    const database = await openDatabase({ name: `swim-buddy-v1-${String(++databaseCounter)}` })

    expect([...database.objectStoreNames].sort()).toEqual([
      'activities',
      'effort_bands',
      'equipment',
      'patterns',
      'sessions',
      'settings',
      'structures',
      'swimmers',
      'templates',
      'test_sets',
    ])

    const transaction = database.transaction(['sessions', 'test_sets'])
    expect([...transaction.objectStore('sessions').indexNames].sort()).toEqual([
      'by_date',
      'by_swimmer',
    ])
    expect([...transaction.objectStore('test_sets').indexNames]).toEqual(['by_swimmer'])
    database.close()
  })

  it('upgrades an existing database without touching the data already in it', async () => {
    const name = `swim-buddy-upgrade-${String(++databaseCounter)}`

    const before = await openStore({ name, dependencies: testDependencies() })
    const swimmer = await before.swimmers.create({ ...aSwimmer, name: 'Survivor' })
    before.close()

    // A future migration, applied to a database that already ran version 1.
    const addedStore = 'workout_plans'
    const nextVersion: Migration = {
      version: DATABASE_VERSION + 1,
      description: 'Adds a store, standing in for a future schema change.',
      apply({ database }) {
        // @ts-expect-error the store is not in SwimBuddyDB — that is the point.
        database.createObjectStore(addedStore, { keyPath: 'id' })
      },
    }

    const database = await openDatabase({
      name,
      version: DATABASE_VERSION + 1,
      migrations: [...MIGRATIONS, nextVersion],
    })

    expect([...database.objectStoreNames]).toContain(addedStore)

    const survivor = await database.get('swimmers', swimmer.id)
    expect(survivor?.name).toBe('Survivor')
    database.close()
  })
})
