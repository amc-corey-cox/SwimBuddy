import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { openStore, type StoreDependencies, type SwimBuddyStore } from './store'
import { seedIfEmpty } from './seed'
import { ACTIVITIES } from '../core/activities'
import { EFFORTS, EQUIPMENT, PATTERNS, STRUCTURES } from '../core/modifiers'

const SHIPPED_TOTAL =
  ACTIVITIES.length + EQUIPMENT.length + EFFORTS.length + PATTERNS.length + STRUCTURES.length

let counter = 0

function testDependencies(): StoreDependencies {
  let tick = 0
  return { now: () => Date.UTC(2026, 5, 1) + ++tick, newId: () => `id-${String(++tick)}` }
}

describe('the catalogue collections', () => {
  let store: SwimBuddyStore

  beforeEach(async () => {
    store = await openStore({
      name: `swim-buddy-catalogue-${String(++counter)}`,
      dependencies: testDependencies(),
    })
  })

  it('starts empty and holds the shipped entries once seeded', async () => {
    expect(await store.activities.list()).toEqual([])

    const result = await seedIfEmpty(store)

    expect(result.catalogue_entries).toBe(SHIPPED_TOTAL)
    expect(await store.activities.list()).toHaveLength(ACTIVITIES.length)
    expect((await store.activities.get('tread_water'))?.name).toBe('Treading water')
  })

  it('keys an entry by its own semantic id, not a generated one', async () => {
    // A parsed set refers to `free`. If seeding assigned a UUID instead, every
    // template in the store would point at an activity that is not there.
    await seedIfEmpty(store)

    expect((await store.activities.get('free'))?.id).toBe('free')
  })

  it('seeds the shipped timestamps rather than stamping its own', async () => {
    // The documented reason `put` keeps the envelope: two phones seeding
    // independently have to agree about a row neither of them touched, and a
    // seed-time clock would make every install disagree.
    await seedIfEmpty(store)
    const stored = await store.activities.get('free')
    const shippedEntry = ACTIVITIES.find((activity) => activity.id === 'free')

    expect(stored?.created_at).toBe(shippedEntry?.created_at)
    expect(stored?.updated_at).toBe(shippedEntry?.updated_at)
  })

  it('stamps updated_at when a swimmer hides an entry', async () => {
    // The exception has a boundary: `remove` is a user action, so the store owns
    // the timestamp there as it does everywhere else.
    await seedIfEmpty(store)
    const before = await store.activities.get('corkscrew')
    const hidden = await store.activities.remove('corkscrew')

    expect(hidden.updated_at).toBeGreaterThan(before?.updated_at ?? 0)
  })

  it('writes nothing on a second run', async () => {
    await seedIfEmpty(store)
    const second = await seedIfEmpty(store)

    expect(second.catalogue_entries).toBe(0)
    expect(await store.activities.list()).toHaveLength(ACTIVITIES.length)
  })

  it('does not overwrite an entry the swimmer has edited', async () => {
    await seedIfEmpty(store)
    const free = await store.activities.get('free')
    if (free === undefined) throw new Error('expected a seeded activity')

    await store.activities.put({ ...free, name: 'Front crawl' })
    await seedIfEmpty(store)

    expect((await store.activities.get('free'))?.name).toBe('Front crawl')
  })

  it('hides a removed entry but keeps the row for a future sync', async () => {
    await seedIfEmpty(store)
    await store.activities.remove('corkscrew')

    expect(await store.activities.get('corkscrew')).toBeUndefined()
    expect((await store.activities.get('corkscrew', { includeDeleted: true }))?.deleted).toBe(true)
  })

  it('does not re-seed an entry the swimmer hid', async () => {
    // Seeding adds what is missing. A tombstone is not missing — it is a decision.
    await seedIfEmpty(store)
    await store.activities.remove('corkscrew')
    await seedIfEmpty(store)

    expect(await store.activities.get('corkscrew')).toBeUndefined()
  })

  it('returns undefined for an id the catalogue does not have', async () => {
    await seedIfEmpty(store)

    expect(await store.activities.get('synchronised_napping')).toBeUndefined()
  })

  it('refuses to remove an entry that is not there', async () => {
    await expect(store.activities.remove('synchronised_napping')).rejects.toThrow(
      /No activities entry/,
    )
  })

  it('seeds the catalogues even when the household is already there', async () => {
    // Reference data and the household have different rules: an upgrade adding an
    // activity has to reach a store someone is already using.
    await store.swimmers.create({
      name: 'Existing',
      birth_year: 1990,
      base_pace_by_stroke: { free: 120 },
      load_factor: 1,
      is_youth: false,
    })

    const result = await seedIfEmpty(store)

    expect(result.seeded).toBe(false)
    expect(result.catalogue_entries).toBe(SHIPPED_TOTAL)
  })

  it('carries every catalogue into the snapshot', async () => {
    await seedIfEmpty(store)
    const snapshot = await store.snapshot()

    expect(snapshot.activities).toHaveLength(ACTIVITIES.length)
    expect(snapshot.equipment).toHaveLength(EQUIPMENT.length)
    expect(snapshot.effort_bands).toHaveLength(EFFORTS.length)
    expect(snapshot.patterns).toHaveLength(PATTERNS.length)
    expect(snapshot.structures).toHaveLength(STRUCTURES.length)
  })
})
