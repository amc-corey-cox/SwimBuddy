import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { onUpgradeBlocked, onUpgradeBlocking, openDatabase } from './db'
import { DATABASE_NAME, DATABASE_VERSION, MIGRATIONS } from './schema'

/**
 * A blocked upgrade otherwise looks like `openDB` hanging for no reason, which
 * is miserable to diagnose on a phone at the pool. These assert the seam exists
 * and says something useful.
 */
describe('multi-tab upgrade handlers', () => {
  it('warns, naming the other tab, when an upgrade is blocked', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    onUpgradeBlocked()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('another open tab'))
    warn.mockRestore()
  })

  it('warns when this tab is the one blocking an upgrade', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    onUpgradeBlocking()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('blocking a database upgrade'))
    warn.mockRestore()
  })
})

describe('defaults', () => {
  it('opens the real database name and version when given no options', async () => {
    const database = await openDatabase()

    expect(database.name).toBe(DATABASE_NAME)
    expect(database.version).toBe(DATABASE_VERSION)
    database.close()
  })
})

/**
 * The one migration so far that rewrites rows rather than creating stores.
 *
 * Worth exercising against a real upgrade rather than by calling `apply`
 * directly: the reason it uses a raw cursor is that the versionchange
 * transaction must stay open until the last row is rewritten, and only a real
 * upgrade can show that it does.
 */
describe('migration 3, dropping birth_year', () => {
  const upTo = (version: number) => MIGRATIONS.filter((migration) => migration.version <= version)

  async function seedAtVersion2(name: string, swimmers: readonly Record<string, unknown>[]) {
    const database = await openDatabase({ name, version: 2, migrations: upTo(2) })
    const transaction = database.transaction('swimmers', 'readwrite')
    for (const swimmer of swimmers) {
      // Cast: the stored shape is deliberately the old one, which no longer
      // matches the generated type. That is the whole point of the migration.
      await transaction.store.put(swimmer as never)
    }
    await transaction.done
    database.close()
  }

  it('strips the field from a swimmer stored before it was removed', async () => {
    const name = `swim-buddy-migration-3-${String(Date.now())}`
    await seedAtVersion2(name, [
      {
        id: 'a0000000-0000-4000-8000-00000000000a',
        name: 'Rowan',
        birth_year: 1979,
        base_pace_by_stroke: { free: 95 },
        load_factor: 1.0,
        is_youth: false,
        created_at: 1,
        updated_at: 1,
        deleted: false,
      },
    ])

    const upgraded = await openDatabase({ name, version: 3, migrations: upTo(3) })
    const swimmer = await upgraded.get('swimmers', 'a0000000-0000-4000-8000-00000000000a')
    upgraded.close()

    expect(swimmer).not.toHaveProperty('birth_year')
    // Everything else survives: a migration that loses a base pace is worse
    // than one that leaves a dead field behind.
    expect(swimmer?.name).toBe('Rowan')
    expect(swimmer?.base_pace_by_stroke.free).toBe(95)
    expect(swimmer?.load_factor).toBe(1.0)
    expect(swimmer?.is_youth).toBe(false)
  })

  it('rewrites every row, not only the first', async () => {
    const name = `swim-buddy-migration-3-many-${String(Date.now())}`
    const ids = ['b', 'c', 'd'].map((suffix) => `a0000000-0000-4000-8000-00000000000${suffix}`)
    await seedAtVersion2(
      name,
      ids.map((id, index) => ({
        id,
        name: `Swimmer ${String(index)}`,
        birth_year: 1980 + index,
        base_pace_by_stroke: { free: 100 },
        load_factor: 1.0,
        is_youth: false,
        created_at: 1,
        updated_at: 1,
        deleted: false,
      })),
    )

    const upgraded = await openDatabase({ name, version: 3, migrations: upTo(3) })
    const swimmers = await upgraded.getAll('swimmers')
    upgraded.close()

    expect(swimmers).toHaveLength(3)
    for (const swimmer of swimmers) {
      expect(swimmer).not.toHaveProperty('birth_year')
    }
  })

  it('leaves a swimmer that never had the field untouched', async () => {
    const name = `swim-buddy-migration-3-clean-${String(Date.now())}`
    await seedAtVersion2(name, [
      {
        id: 'a0000000-0000-4000-8000-00000000000e',
        name: 'Quinn',
        base_pace_by_stroke: { free: 110 },
        load_factor: 1.0,
        is_youth: true,
        created_at: 1,
        updated_at: 2,
        deleted: false,
      },
    ])

    const upgraded = await openDatabase({ name, version: 3, migrations: upTo(3) })
    const swimmer = await upgraded.get('swimmers', 'a0000000-0000-4000-8000-00000000000e')
    upgraded.close()

    expect(swimmer?.name).toBe('Quinn')
    expect(swimmer?.updated_at).toBe(2)
  })
})
