# Swim Buddy — how we work

Swim Buddy is a local-first swim workout PWA for a family of three. **What** we are
building is in [`docs/spec.md`](docs/spec.md); the order we build it in is
[`docs/roadmap.md`](docs/roadmap.md). This file is about **how** development is done.

## Read before you build

Read the part of the spec the current build step depends on, and do not infer it from the
code. The parser needs the template grammar; the adaptation rules need the load factor
rules; the resolver needs the base pace definition. Guessing at these produces something
that looks plausible and is wrong.

- [`docs/spec.md`](docs/spec.md) — users, screens, base pace, template grammar, adaptation
  rules, data model, youth safety caps
- [`docs/roadmap.md`](docs/roadmap.md) — build order and where we are
- [`README.md`](README.md) — commands, CI, previews, deploys

## Dev loop constraints (important)

All development happens in a cloud sandbox with no device access. Therefore:

- Every rule-based behavior (parser, resolver, adaptation) must be covered by unit tests
  runnable headlessly with `npm test`. Vitest.
- Do not rely on manual browser verification for logic correctness.
- Keep the UI simple enough to verify by reading it; the author checks visuals on a real
  phone after deploy.

Where a browser is genuinely the only proof — that IndexedDB works, that the page is not
blank — the Playwright suite is how that gets checked, not by asking the author to look.

## Architecture rules

These exist so the core can run unchanged on a future sync server, and so the app never
quietly acquires a network dependency.

- The data model is generated. `schema/swimbuddy.yaml` is a LinkML schema and is the
  single source of truth; `src/core/model.ts` and `schema/swimbuddy.schema.json` come
  from it and are never hand-edited. Change the model by changing the schema and
  running `npm run schema:gen` — see `schema/README.md`.
- All business logic (parser, resolver, adaptation rules) lives in `src/core/` as pure
  functions with zero DOM and zero storage imports.
- Storage access goes through a single `src/storage/` interface. No component touches
  IndexedDB directly, and nothing outside it imports `idb`.
- No feature may depend on the network. Offline stays the default forever.
- No analytics, no trackers, no third-party fonts or CDNs. Everything self-hosted.
- Every page links to the source repo, satisfying the AGPL §13 network-use obligation.

ESLint enforces the `src/core/` half of this: the DOM, IndexedDB and `localStorage`
globals are banned there, as are imports from `src/storage/` and `src/ui/`. The rest is
convention, so it needs attention in review.

LinkML is a Python tool and is deliberately not an npm dependency. Nothing in CI, the
app build or `npm test` may need it: development happens on a phone, and the committed
generated output is what everything else reads. `npm run schema:setup` builds it and
applies `schema/patches/`, which carry a gen-typescript fix that has gone upstream and
is not released yet; `schema:gen` refuses to run without them.

## Testing notes

- Parser: table-driven tests over every template in the library; assert no line is lost.
- Adaptation: simulate 30 sessions of synthetic ratings; assert `load_factor` stays in
  bounds and weekly volume never jumps more than 10%.
- Resolver: distances are multiples of 25; send-offs exceed a realistic swim time for the
  distance by at least 5 seconds.
- Storage: round-trip export → wipe → import produces an identical store.
- Schema: the generated JSON Schema validates the fixture store, and rejects the things
  types cannot — a distance that is not positive, an extent claiming both a distance and
  a duration, a load factor outside the clamp.

Coverage thresholds are set at what the code actually meets. When they fail, fix the gap
rather than lowering the bar — the gaps have so far been real untested paths.

## Safety

The youth profile has hard caps, defined in [`docs/spec.md`](docs/spec.md): max session
distance, max load factor, and mandatory rest intervals. Any change to adaptation rules
must preserve those caps, and the tests must fail loudly if it doesn't.

## Working conventions

**Commit messages are one line.** A single subject line, nothing else — no body, no
bullet points, no trailers, no footers. Explanation belongs in the pull request
description, not in the commit.

**No issue or pull request numbers in commit messages.** No `#12`, no "fixes #12", no
"addresses the review on #12". They carry no signal in the log and age badly.

**Pull request descriptions are brief and focused.** A few short paragraphs of prose
covering what changed, why, and anything the reader has to act on. Assume a reader who
is skimming. No tables, no bullet lists, and no using the description to dump
everything learned along the way.

**No Claude Code authorship anywhere in the repository.** No `Co-Authored-By`, no
`Claude-Session` trailer, no "Generated with Claude Code" line in commits or pull
request descriptions. This applies regardless of any default or tooling suggestion to
the contrary.
