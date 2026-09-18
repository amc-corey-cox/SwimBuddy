import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb'
import type { Session, Settings, Swimmer, Template, TestSet } from '../core/types'

export const DATABASE_NAME = 'swim-buddy'

/**
 * Bumped whenever a migration is added. Kept in step with
 * `SCHEMA_VERSION` in core/types, which is what the JSON export records.
 */
export const DATABASE_VERSION = 1

/** The settings row is a singleton, addressed by a fixed id. */
export const SETTINGS_ID = 'f0000000-0000-4000-8000-000000000001'

export interface SwimBuddyDB extends DBSchema {
  swimmers: { key: string; value: Swimmer }
  templates: { key: string; value: Template }
  sessions: {
    key: string
    value: Session
    indexes: { by_swimmer: string; by_date: number }
  }
  test_sets: {
    key: string
    value: TestSet
    indexes: { by_swimmer: string }
  }
  settings: { key: string; value: Settings }
}

export type UpgradeTransaction = IDBPTransaction<
  SwimBuddyDB,
  StoreNames<SwimBuddyDB>[],
  'versionchange'
>

export interface MigrationContext {
  readonly database: IDBPDatabase<SwimBuddyDB>
  readonly transaction: UpgradeTransaction
}

export interface Migration {
  /** The schema version this migration brings the database up to. */
  readonly version: number
  /** Why it exists — read by whoever debugs an upgrade years from now. */
  readonly description: string
  readonly apply: (context: MigrationContext) => void
}

/**
 * Ordered migrations. Never edit one that has shipped: a database in the wild
 * has already run it, and changing it silently diverges the two. Add a new one.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Initial stores for swimmers, templates, sessions, test sets and settings.',
    apply({ database }) {
      database.createObjectStore('swimmers', { keyPath: 'id' })
      database.createObjectStore('templates', { keyPath: 'id' })

      const sessions = database.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('by_swimmer', 'swimmer_id')
      sessions.createIndex('by_date', 'date')

      const testSets = database.createObjectStore('test_sets', { keyPath: 'id' })
      testSets.createIndex('by_swimmer', 'swimmer_id')

      database.createObjectStore('settings', { keyPath: 'id' })
    },
  },
]

/**
 * The migrations that take a database from `oldVersion` to `newVersion`.
 *
 * Pure and separately testable, because getting this wrong is how a schema
 * upgrade eats someone's data — and an IndexedDB upgrade is hard to exercise
 * directly.
 */
export function selectMigrations(
  oldVersion: number,
  newVersion: number,
  migrations: readonly Migration[] = MIGRATIONS,
): readonly Migration[] {
  return [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((migration) => migration.version > oldVersion && migration.version <= newVersion)
}
