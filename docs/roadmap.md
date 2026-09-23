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
10. Swimming together: one arrangement, resolved per swimmer, several swims live at once.
11. Per-set feedback — capture and storage now, adaptation rules later.

## Status

Steps 1 to 7 are merged and deployed. The loop closes: pick a swimmer, pick a length,
swim the workout, say how it went, and the next session changes accordingly.

The set model was reworked during step 3 and the parser targets it: extent is a distance
or a duration, a set is repetitions over one or more parts, and activities, equipment,
effort, patterns and structures are all catalogue data matched by shared rules.

The model itself is generated from `schema/swimbuddy.yaml`, a LinkML schema, rather than
hand-written TypeScript. That also produces a JSON Schema, which is what step 8's import
path should validate against rather than trusting the file it is handed.

Steps 10 and 11 were added after the first real look at the deployed app, and come next.
Both are about the same mismatch: the app assumes one swimmer at a time rating one whole
workout, and a family swims together and notices particular sets. Step 11 stores the
signal without acting on it, so the adaptation rules are written against real history
rather than invented thresholds — which also means step 8 is what makes step 11 visible,
and the two belong near each other.

What is left before this is a finished v1 is History, Settings and the test set flow —
steps 8 and 9 — which between them are the only way to change a pool unit, rename a
swimmer, or record a real base pace.

The resolver landed with the youth safety caps, two of whose numbers the spec named but
never defined. They are written down now and still want the author's sign-off — see
Safety in the spec.
