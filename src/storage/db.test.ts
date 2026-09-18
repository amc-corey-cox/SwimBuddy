import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { onUpgradeBlocked, onUpgradeBlocking, openDatabase } from './db'
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
