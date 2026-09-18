# Build order

Where the project is going and in what order. The spec for each step lives in
[spec.md](spec.md); how we build is in [../CLAUDE.md](../CLAUDE.md).

1. Repo skeleton, Vite + TS + Vitest, `LICENSE` (AGPLv3), Pages deploy workflow.
2. Storage layer + schema + migrations + seeded swimmers.
3. Template parser + thorough unit tests. The interesting part.
4. Activity catalogue, and a small set of template arrangements built on it.
5. Resolver: template + swimmer → concrete workout.
6. Workout view screen (+ wake lock, + service worker offline).
7. Post-swim rating + adaptation rules + tests.
8. History + JSON export/import.
9. Test set flow.

## Status

Steps 1 and 2 are merged. Step 3 is in review.

The set model was reworked during step 3: extent is a distance or a duration, activities
are catalogue data carrying their own pacing, and a set is repetitions over one or more
parts. The parser targets the older flat shape and needs revising to match before step 4.
