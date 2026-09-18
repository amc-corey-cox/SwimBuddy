import { describe, expect, it } from 'vitest'
import { MIGRATIONS, selectMigrations, type Migration } from './schema'

/**
 * `selectMigrations` is pure precisely so it can be tested without IndexedDB.
 * Picking the wrong set is how a schema upgrade eats someone's data.
 */
const fake = (version: number): Migration => ({
  version,
  description: `migration ${String(version)}`,
  apply: () => undefined,
})

const three = [fake(1), fake(2), fake(3)]

describe('selectMigrations', () => {
  it('runs everything on a brand new database', () => {
    expect(selectMigrations(0, 3, three).map((m) => m.version)).toEqual([1, 2, 3])
  })

  it('runs only what the stored version is behind on', () => {
    expect(selectMigrations(1, 3, three).map((m) => m.version)).toEqual([2, 3])
  })

  it('runs nothing when already current', () => {
    expect(selectMigrations(3, 3, three)).toEqual([])
  })

  it('never runs past the target version', () => {
    expect(selectMigrations(0, 2, three).map((m) => m.version)).toEqual([1, 2])
  })

  it('applies them in ascending order even if declared out of order', () => {
    const jumbled = [fake(3), fake(1), fake(2)]
    expect(selectMigrations(0, 3, jumbled).map((m) => m.version)).toEqual([1, 2, 3])
  })

  it('never re-runs a migration the database has already applied', () => {
    for (const applied of [1, 2, 3]) {
      const selected = selectMigrations(applied, 3, three).map((m) => m.version)
      expect(selected.every((version) => version > applied)).toBe(true)
    }
  })
})

describe('shipped migrations', () => {
  it('has strictly increasing, gapless versions starting at 1', () => {
    const versions = MIGRATIONS.map((migration) => migration.version)
    expect(versions).toEqual(versions.map((_, index) => index + 1))
  })

  it('describes every migration, for whoever debugs an upgrade later', () => {
    for (const migration of MIGRATIONS) {
      expect(migration.description.trim().length).toBeGreaterThan(0)
    }
  })
})
