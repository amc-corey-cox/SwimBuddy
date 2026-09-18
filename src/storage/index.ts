/**
 * The only supported way into persistent storage.
 *
 * No screen and nothing in src/core/ may import `idb` or touch IndexedDB
 * directly — see CLAUDE.md "Future backend". ESLint enforces the core half of
 * that rule; the rest is convention.
 */
export { openStore, defaultDependencies, DEFAULT_SETTINGS } from './store'
export type {
  Collection,
  OpenStoreOptions,
  ReadOptions,
  RecordInput,
  RecordPatch,
  SessionCollection,
  StoreDependencies,
  SwimBuddyStore,
  TestSetCollection,
} from './store'
export { seedIfEmpty, SEED_SWIMMERS } from './seed'
export type { SeedOptions, SeedResult, SeedSwimmer } from './seed'
export {
  DATABASE_NAME,
  DATABASE_VERSION,
  SETTINGS_ID,
  MIGRATIONS,
  selectMigrations,
} from './schema'
export type { Migration, MigrationContext } from './schema'
