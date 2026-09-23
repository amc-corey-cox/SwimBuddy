import { deleteDB, openDB, type IDBPDatabase } from 'idb'
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  MIGRATIONS,
  type Migration,
  type SwimBuddyDB,
  selectMigrations,
} from './schema'

export interface OpenDatabaseOptions {
  /** Overridden in tests so each case gets an isolated database. */
  readonly name?: string
  readonly version?: number
  readonly migrations?: readonly Migration[]
}

/**
 * Another tab holds an older version open, so this upgrade is waiting. It is not
 * an error — IndexedDB resolves it once the other tab closes the connection — but
 * it is worth surfacing, because the alternative is an open() that appears to
 * hang. Named and exported so the multi-tab seam is explicit and testable; a
 * later version may want to prompt the user rather than only warn.
 */
export function onUpgradeBlocked(): void {
  console.warn('Swim Buddy: database upgrade is blocked by another open tab.')
}

/** The mirror image: this tab is holding the version a newer tab wants to replace. */
export function onUpgradeBlocking(): void {
  console.warn('Swim Buddy: this tab is blocking a database upgrade in another tab.')
}

/**
 * Opens the database, applying any migrations the stored version is behind on.
 *
 * This is the only place in the app that calls `openDB`. Everything else goes
 * through the store interface — see CLAUDE.md "Future backend".
 */
export async function openDatabase(
  options: OpenDatabaseOptions = {},
): Promise<IDBPDatabase<SwimBuddyDB>> {
  const name = options.name ?? DATABASE_NAME
  const migrations = options.migrations ?? MIGRATIONS
  const version = options.version ?? DATABASE_VERSION

  return openDB<SwimBuddyDB>(name, version, {
    upgrade(database, oldVersion, newVersion, transaction) {
      for (const migration of selectMigrations(oldVersion, newVersion ?? version, migrations)) {
        migration.apply({ database, transaction })
      }
    },
    blocked: onUpgradeBlocked,
    blocking: onUpgradeBlocking,
  })
}

/** A delete is waiting on a connection another tab still holds open. */
export function onDeleteBlocked(): void {
  console.warn('Swim Buddy: erasing the database is blocked by another open tab.')
}

/**
 * Deletes the database outright, so the next open starts from nothing.
 *
 * There is no export yet, so this is irreversible and the only undo is that
 * seeding puts the household back. The caller must close its store first:
 * IndexedDB will not delete a database that still has an open connection, and
 * a blocked delete does not fail, it simply never completes — which on a phone
 * is indistinguishable from the app having hung.
 */
export async function deleteDatabase(name: string = DATABASE_NAME): Promise<void> {
  await deleteDB(name, { blocked: onDeleteBlocked })
}
