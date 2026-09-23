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

Steps 1 to 3 are merged. Steps 4, 5, 6 and 7 are in review, stacked in that order.

The set model was reworked during step 3 and the parser now targets it: extent is a
distance or a duration, a set is repetitions over one or more parts, and activities,
equipment, effort, patterns and structures are all catalogue data matched by shared
rules. All five catalogues live in `src/core/` and are matched but not yet stored;
seeding them into IndexedDB is step 4.

The model itself is now generated from `schema/swimbuddy.yaml`, a LinkML schema, rather
than hand-written TypeScript. That also produces a JSON Schema, which is what step 8's
import path should validate against rather than trusting the file it is handed.

The app is usable end to end and the loop closes: pick a swimmer, pick a length, swim the
workout, say how it went, and the next session changes accordingly. What is left before
this is a finished v1 is History, Settings and the test set flow — steps 8 and 9 — which
between them are the only way to change a pool unit or record a real base pace.

The resolver landed with the youth safety caps, two of whose numbers the spec named but
never defined. They are written down now and want the author's sign-off — see Safety in
the spec. Template selection is still to come, and the resolver assumes it: a template
whose single set exceeds the youth distance cap cannot be trimmed under it, so selection
has to not offer one.
