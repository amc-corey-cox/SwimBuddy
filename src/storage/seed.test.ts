import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { openStore, type StoreDependencies, type SwimBuddyStore } from './store'
import { SEED_SWIMMERS, seedIfEmpty } from './seed'

const REFERENCE = Date.UTC(2026, 5, 1, 12, 0, 0)

function testDependencies(): StoreDependencies {
  let tick = 0
  let counter = 0
  return {
    now: () => REFERENCE + tick++ * 1000,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  }
}

let databaseCounter = 0
let store: SwimBuddyStore

beforeEach(async () => {
  store = await openStore({
    name: `swim-buddy-seed-${String(++databaseCounter)}`,
    dependencies: testDependencies(),
  })
})

describe('seeding an empty store', () => {
  it('creates the roster from the spec', async () => {
    const result = await seedIfEmpty(store)

    expect(result.seeded).toBe(true)
    expect(result.swimmers.map((swimmer) => swimmer.name)).toEqual(
      SEED_SWIMMERS.map((seed) => seed.name),
    )
  })

  it('marks exactly one swimmer as youth', async () => {
    const { swimmers } = await seedIfEmpty(store)
    expect(swimmers.filter((swimmer) => swimmer.is_youth)).toHaveLength(1)
  })

  it('starts everyone at the default load factor', async () => {
    const { swimmers } = await seedIfEmpty(store)
    for (const swimmer of swimmers) {
      expect(swimmer.load_factor).toBe(1.0)
    }
  })

  it('marks exactly the swimmers the seed calls youth', async () => {
    const { swimmers } = await seedIfEmpty(store)

    for (const swimmer of swimmers) {
      const seed = SEED_SWIMMERS.find((candidate) => candidate.name === swimmer.name)
      expect(swimmer.is_youth).toBe(seed!.is_youth)
    }
  })

  it('persists the default settings row', async () => {
    await seedIfEmpty(store)
    const snapshot = await store.snapshot()

    expect(snapshot.settings.pool_unit).toBe('yards')
    expect(snapshot.settings.pool_length).toBe(25)
  })

  it('leaves every swimmer untested, so the app knows to ask for a base pace', async () => {
    const { swimmers } = await seedIfEmpty(store)

    for (const swimmer of swimmers) {
      expect(await store.testSets.latestForSwimmer(swimmer.id)).toBeUndefined()
      // A provisional pace exists so nothing divides by zero before the test.
      expect(swimmer.base_pace_by_stroke.free).toBeGreaterThan(0)
    }
  })
})

describe('seeding records no age', () => {
  it('stores nothing beyond the youth flag, because no rule reads an age', async () => {
    const { swimmers, seeded } = await seedIfEmpty(store)

    expect(seeded).toBe(true)
    for (const swimmer of swimmers) {
      expect(swimmer).not.toHaveProperty('birth_year')
    }
  })
})

describe('seeding is safe to call repeatedly', () => {
  it('does not duplicate on a second call', async () => {
    await seedIfEmpty(store)
    const second = await seedIfEmpty(store)

    expect(second.seeded).toBe(false)
    expect(await store.swimmers.list()).toHaveLength(SEED_SWIMMERS.length)
  })

  it('does not re-seed after the user deletes every swimmer', async () => {
    const { swimmers } = await seedIfEmpty(store)
    for (const swimmer of swimmers) {
      await store.swimmers.remove(swimmer.id)
    }

    const again = await seedIfEmpty(store)

    // Deleting everyone is a decision; re-seeding would undo it behind their back.
    expect(again.seeded).toBe(false)
    expect(await store.swimmers.list()).toEqual([])
  })

  it('does not report tombstoned swimmers back to the caller', async () => {
    const { swimmers } = await seedIfEmpty(store)
    for (const swimmer of swimmers) {
      await store.swimmers.remove(swimmer.id)
    }

    const again = await seedIfEmpty(store)

    // The emptiness check deliberately counts tombstones, but the returned list
    // should match what a normal read shows — callers render it.
    expect(again.swimmers).toEqual([])
  })

  it('does not seed over a store that already has one swimmer', async () => {
    await store.swimmers.create({
      name: 'Existing',
      base_pace_by_stroke: { free: 100 },
      load_factor: 1.0,
      is_youth: false,
    })

    const result = await seedIfEmpty(store)

    expect(result.seeded).toBe(false)
    expect(await store.swimmers.list()).toHaveLength(1)
  })
})

describe('seed data respects the youth safety rules', () => {
  it('never seeds a youth swimmer above the 1.15 load factor cap', async () => {
    const { swimmers } = await seedIfEmpty(store)
    for (const swimmer of swimmers.filter((candidate) => candidate.is_youth)) {
      expect(swimmer.load_factor).toBeLessThanOrEqual(1.15)
    }
  })

  it('keeps every seeded load factor inside the global clamp', async () => {
    const { swimmers } = await seedIfEmpty(store)
    for (const swimmer of swimmers) {
      expect(swimmer.load_factor).toBeGreaterThanOrEqual(0.6)
      expect(swimmer.load_factor).toBeLessThanOrEqual(1.4)
    }
  })
})
