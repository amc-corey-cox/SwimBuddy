import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import {
  deleteDatabase,
  onDeleteBlocked,
  onUpgradeBlocked,
  onUpgradeBlocking,
  openDatabase,
} from './db'
import { DATABASE_NAME, DATABASE_VERSION } from './schema'

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

describe('erasing the database', () => {
  it('warns when a delete is blocked by another open tab', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    onDeleteBlocked()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('another open tab'))
    warn.mockRestore()
  })

  it('removes the data, so the next open starts from nothing', async () => {
    const name = `swim-buddy-erase-${String(Date.now())}`

    const first = await openDatabase({ name })
    await first.put('swimmers', {
      id: 'a0000000-0000-4000-8000-00000000000a',
      name: 'Rowan',
      base_pace_by_stroke: { free: 95 },
      load_factor: 1.0,
      is_youth: false,
      created_at: 1,
      updated_at: 1,
      deleted: false,
    })
    expect(await first.count('swimmers')).toBe(1)
    // The connection has to go first: IndexedDB will not delete a database that
    // still has one open, and the request hangs rather than failing.
    first.close()

    await deleteDatabase(name)

    const second = await openDatabase({ name })
    expect(await second.count('swimmers')).toBe(0)
    second.close()
  })
})
