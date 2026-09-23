Synthetic data: three invented swimmers, three templates, and roughly eight weeks
of session history.

The names and times here are made up. This repository is public, so no real
family data belongs in it.

Fixtures are pure and deterministic — every record is derived from a reference
date passed in by the caller, and nothing calls `Date.now()`. Tests pass
`FIXTURE_REFERENCE_DATE` and get byte-identical records on every run; the preview
build passes the real current time so demo history reads as recent.

They exist to serve three jobs:

1. **Unit tests** — `demoTemplates()` is the parser's corpus for build order step
   3, and the session history is authored to exercise the adaptation rules in
   step 7 (consecutive `too_easy` completions, a session cut short, a layoff of
   more than ten days, two consecutive thumbs-down from the youth swimmer).
2. **PR previews** — the preview build seeds the UI from `demoStore()`, so a
   preview shows a populated app rather than an empty one.
3. **Storage round-trip tests** — `demoStore()` is already the shape of the JSON
   export file, so the export/import step can export, wipe, import, and compare.

`fixtures.test.ts` enforces the invariants that keep this data honest: valid
unique UUIDs, referential integrity, youth caps, distances that are multiples of
25, and computed base paces that agree with each swimmer's record. If the data
model changes underneath the fixtures, those tests fail rather than the data
quietly going stale.

Nothing here may be imported by production code paths. `scripts/assert-no-fixtures-in-bundle.mjs`, which CI
runs on every production build, asserts they do not reach it.
