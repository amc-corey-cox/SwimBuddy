# Build order

Where the project is going and in what order. The spec for each step lives in
[spec.md](spec.md); how we build is in [../CLAUDE.md](../CLAUDE.md).

1. Repo skeleton, Vite + TS + Vitest, `LICENSE` (AGPLv3), Pages deploy workflow.
2. Storage layer + schema + migrations + seeded swimmers.
3. Template parser + thorough unit tests. The interesting part.
4. Seed the catalogues into storage, and a small set of template arrangements built on them.
5. Resolver: template + swimmer → concrete workout.
6. Workout view screen (+ wake lock, + service worker offline).
7. Post-swim rating + adaptation rules + tests.
8. History + JSON export/import.
9. Test set flow.

## Status

Steps 1 and 2 are merged. Step 3 is in review.

The set model was reworked during step 3 and the parser now targets it: extent is a
distance or a duration, a set is repetitions over one or more parts, and activities,
equipment, effort, patterns and structures are all catalogue data matched by shared
rules. All five catalogues live in `src/core/` and are matched but not yet stored;
seeding them into IndexedDB is step 4.
