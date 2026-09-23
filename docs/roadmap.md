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
8. ~~Roster: add, name and remove swimmers, and choose adult or youth, at the pool.~~ Done.
9. Practice: one arrangement resolved per swimmer, held in storage rather than memory.
10. ~~The multi-swimmer card: every swimmer's numbers for the current set, on one screen.~~ Done.
11. Per-set feedback — capture and storage now, adaptation rules later.
12. History + JSON export/import.
13. Test set flow.

## Status

Steps 1 to 7 are merged and deployed. The loop closes: pick a swimmer, pick a length,
swim the workout, say how it went, and the next session changes accordingly.

The set model was reworked during step 3 and the parser targets it: extent is a distance
or a duration, a set is repetitions over one or more parts, and activities, equipment,
effort, patterns and structures are all catalogue data matched by shared rules.

The model itself is generated from `schema/swimbuddy.yaml`, a LinkML schema, rather than
hand-written TypeScript. That also produces a JSON Schema, which is what the import
path in step 12 should validate against rather than trusting the file it is handed.

Steps 8 to 11 were added after the first real look at the deployed app, and they widen
what this is for: not one family of three taking turns, but a small roster — a family, a
masters lane, a squad — swimming together and sharing one phone. The spec's Users section
is the change; everything here follows from it.

They are ordered by what depends on what rather than by size. The roster comes first
because a team cannot exist without it and because the swimmers are still called Me, Wife
and Son, which is the most embarrassing thing about the deployed app. The Practice record
comes next and is the real structural change: a workout in progress moves out of memory
and into storage, which fixes the existing bug where leaving the screen loses the swim,
and which step 10 then needs — the phone holding four people's practice is the only copy
of it. The multi-swimmer card is built on top of that and is mostly presentation once the
record exists. Step 11 stores the per-set signal without
acting on it, so the adaptation rules get written against real history rather than
invented thresholds.

Nothing in 8 to 11 changes the adaptation rules or the resolver. The arrangement is the
shared thing; load factors, caps and sessions stay per swimmer exactly as they are.

What is left after that before this is a finished v1 is History, Settings and the test set
flow — steps 12 and 13 — which between them are the only way to change a pool unit, see a
past session, or record a real base pace. History is also where step 11's set feedback
becomes visible, so it matters more than its position suggests.

The resolver landed with the youth safety caps, two of whose numbers the spec named but
never defined. They are written down now and still want the author's sign-off — see
Safety in the spec.
