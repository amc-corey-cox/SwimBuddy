The only supported way into persistent storage. Nothing outside this directory
may import `idb` or touch IndexedDB — see CLAUDE.md, "Future backend".

## Layout

| File        | Role                                                           |
| ----------- | -------------------------------------------------------------- |
| `schema.ts` | Store definitions, indexes, and the ordered migration list     |
| `db.ts`     | The single `openDB` call, plus the multi-tab upgrade handlers  |
| `store.ts`  | `SwimBuddyStore`: the interface everything else uses           |
| `seed.ts`   | The default roster, written only into an empty store           |
| `index.ts`  | The public surface; import from here, not from the files above |

## Records

Every record carries the sync envelope from the spec: a client-generated UUIDv4,
`created_at`/`updated_at` in epoch milliseconds, and a `deleted` tombstone. The
store owns all four — callers pass only the meaningful fields, and a patch
cannot overwrite identity or bookkeeping.

`put()` is the deliberate exception, and exists for exactly two callers: seeding
and import. Both are cases where the envelope _is_ the data. A shipped catalogue
entry carries a fixed `created_at` so that two phones seeding independently agree
about a row neither of them touched, and an imported record has to come back with
the timestamps it was exported with or a future sync would treat every import as
an edit. `create()` and `update()` remain the only way a user action writes, and
they still own the envelope.

Deletes are soft. `remove()` flags the row and leaves it in place so a future
sync can propagate the deletion; reads hide tombstones unless asked for them
with `{ includeDeleted: true }`. `purge()` is the hard delete, and exists for
import and wipe, never for a user pressing delete.

## Migrations

`MIGRATIONS` is an ordered list, and `selectMigrations()` — a pure function, so
it is testable without a database — picks the ones a given database is behind
on. Never edit a migration that has shipped: a database in the wild has already
run it, and changing it silently diverges the two. Add a new one and bump
`DATABASE_VERSION`.

## Testing

Unit tests run against `fake-indexeddb`, so the real `idb` code paths, key paths
and indexes are exercised rather than stubbed. Each test opens its own database
by name for isolation, and injects a deterministic clock and id source through
`StoreDependencies`.

That still does not prove IndexedDB works in a browser, so the app opens the
store and seeds on startup, and the Playwright suite asserts the result. If the
storage layer breaks on a real engine, the browser tests go red.

## Seeding

`seedIfEmpty()` writes the two adults and one youth swimmer from the spec, plus
the default settings row. It seeds only when no swimmers exist at all,
tombstones included: deleting everyone is a decision, and re-seeding would undo
it behind the user's back.

The seeded names and ages are placeholders to be edited on the Settings screen
in step 6. Their base paces are provisional — a real one comes from a timed test
set, and because a freshly seeded swimmer has no `TestSet` row, the app can tell
the difference and prompt for a test rather than trusting the placeholder.
