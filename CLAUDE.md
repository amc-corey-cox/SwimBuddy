# Swim Buddy — Project Spec

A local-first swim workout PWA for a family of three. Generates workouts scaled to each
swimmer's fitness and adapts them based on post-swim feedback. No accounts, no telemetry,
no subscriptions. Works offline at the pool.

**License: AGPLv3.** A `LICENSE` file goes in the first commit. Every page must link to
the source repo (footer or About screen) so the AGPL §13 network-use obligation is
satisfied from day one — a backend is planned, see "Future backend" below.

## Users

| Swimmer | Notes |
|---|---|
| Me | Ex-swim-team, ~30 years out of the water. Wants real sets. |
| Wife | Fitness swimmer. |
| Son (11) | Needs variety, drills, shorter sets. Must not feel like a grind. |

## Non-goals (v1)

- No watch integration, stroke detection, or automatic lap counting.
- No login, no cloud sync, no multi-family support.
- No charts beyond a simple weekly-volume view.

## Tech

Target: installable PWA, developed entirely from a phone via Claude Code cloud sessions.

- Vanilla TypeScript + Vite. No React unless it earns its place; this is a handful of screens.
- IndexedDB for storage (via `idb`). No localStorage for real data.
- Service worker for full offline use — the pool has no signal.
- Screen Wake Lock API on the workout screen, with a graceful no-op fallback.
- Deploy: GitHub Actions → GitHub Pages on push to `main`.
- **No analytics, no trackers, no third-party fonts or CDNs.** Everything self-hosted.
- Must be installable: web manifest, icons, standalone display mode.

### Dev loop constraints (important)

All development happens in a cloud sandbox with no device access. Therefore:

- Every rule-based behavior (parser, resolver, adaptation) must be covered by unit tests
  runnable headlessly with `npm test`. Vitest.
- Do not rely on manual browser verification for logic correctness.
- Keep the UI simple enough to verify by reading it; the author checks visuals on a real
  phone after deploy.

## Core concept: base pace

Every swimmer has a **base pace**: sustainable time per 100 in the pool's unit.

Sets are authored relative to base pace, never in absolute seconds:
`8x100 free @ base+15` means send-off = base pace + 15 seconds.

Measuring base pace (prompt a retest every 4–6 weeks):
- Timed 400 and timed 200, rested.
- `base_pace_seconds = (T400 - T200) / 2`
- For the 11-year-old use a 200/100 test and do not push maximal effort.

Store base pace per swimmer per stroke group: free (tested), plus offsets for others
(+10s back, +15s breast, +12s fly) unless separately tested.

## Workout templates

Workouts are **templates**, not generated from scratch. A template is text in swim
shorthand with slots. The app parses text into structured sets, then resolves per swimmer.

```
name: Aerobic base — free
tags: endurance, free
intensity: moderate
level: 2-4

warmup:
  300 swim free easy
  4x50 free @ base+25    # build 1-4

drill:
  4x75 free drill/swim @ base+30

main:
  {reps:4-8}x100 free @ base+15
  50 easy
  {reps:2-4}x200 free @ base+20

cooldown:
  200 choice easy
```

Parser requirements:
- Parse `NxD stroke type @ interval`. Intervals: `base+N`, `base-N`, `base`, or literal `1:30`.
- `{reps:MIN-MAX}` resolves per swimmer from their load factor.
- Distances round to the nearest 25.
- Text after `#` is a coaching note, displayed but not parsed.
- Unparseable lines are preserved verbatim and shown as-is. Never lose content.

Ship 25–40 templates: endurance, sprint, IM, kick, drill/technique, short (30 min),
long (75 min), and "fun" templates for the kid (relays, stroke variety, underwater work).

## Adaptation logic

Rule-based and legible. No ML.

Each swimmer has a `load_factor` (default 1.0, clamped 0.6–1.4) scaling rep counts within
a template's range and adjusting send-offs.

Post-swim the swimmer rates:
- **Effort**: too easy / about right / too hard
- **Completed?**: finished main set / cut it short
- (Son only) **Fun**: thumbs up / down

Rules:
- Two consecutive "too easy" + completed → `load_factor *= 1.05`
- One "too hard" or "cut it short" → `load_factor *= 0.95`
- Two consecutive "too hard" → also add +3s to send-offs for the next 2 sessions
- Weekly total volume may not exceed the trailing week by more than 10%, regardless.
- Over 10 days since last swim → drop `load_factor` 10% and pick a shorter template.
- Son: cap `load_factor` at 1.15; two consecutive thumbs-down biases selection toward
  drill/fun tags.

Template selection: prefer tags unused in the last 3 sessions, respect requested session
length, and never schedule two `intensity: hard` templates back to back.

## Data model

```
Swimmer   { id, name, birth_year, base_pace_by_stroke, load_factor, is_youth }
Template  { id, name, tags, intensity, level_range, raw_text, parsed_sets }
Session   { id, swimmer_id, template_id, date, resolved_sets, total_distance,
            effort_rating, completed, fun_rating, notes }
TestSet   { id, swimmer_id, date, t400, t200, computed_base_pace }
Settings  { pool_unit: yards|meters, pool_length }
```

Design every record with a future backend in mind, even though v1 is local-only:
- IDs are UUIDv4 generated client-side, never auto-increment integers.
- Every record carries `created_at` and `updated_at` (epoch ms) and a `deleted` tombstone
  flag; deletes are soft.
- Keep a schema `version` field in the store and write migrations from the start.

Export/import the entire store as one JSON file — the only "sync" in v1.

## Screens (v1)

1. **Home** — three big swimmer tiles, "Today's workout".
2. **Pre-swim** — session length (30/45/60/75 min) + optional focus. Generates.
3. **Workout view** — the screen that matters. Large high-contrast text readable on a wet
   phone at arm's length. Wake lock on. One set per card, swipe between. Show resolved
   distances and send-off times, never formulas.
4. **Post-swim** — three big rating buttons plus optional note. Under 10 seconds.
5. **History** — sessions per swimmer, total distance, weekly volume chart.
6. **Settings** — pool unit/length, test set entry, JSON export/import, link to source.

## Future backend (not v1 — do not build it yet)

A small sync server may follow: shared template library, syncing the three phones, maybe
a coach mode. Keep the door open without building it:

- All business logic (parser, resolver, adaptation rules) lives in `src/core/` as pure
  functions with zero DOM and zero storage imports, so it can run server-side unchanged.
- Storage access goes through a single `src/storage/` interface. No component touches
  IndexedDB directly.
- No feature may depend on the network. Offline stays the default forever.
- AGPLv3 already covers a future hosted instance; that is why it was chosen over GPLv3.

## Build order

1. Repo skeleton, Vite + TS + Vitest, `LICENSE` (AGPLv3), Pages deploy workflow.
2. Storage layer + schema + migrations + seeded swimmers.
3. Template parser + thorough unit tests. The interesting part.
4. Template library (start with 5, expand later).
5. Resolver: template + swimmer → concrete workout.
6. Workout view screen (+ wake lock, + service worker offline).
7. Post-swim rating + adaptation rules + tests.
8. History + JSON export/import.
9. Test set flow.

## Testing notes

- Parser: table-driven tests over every template in the library; assert no line is lost.
- Adaptation: simulate 30 sessions of synthetic ratings; assert `load_factor` stays in
  bounds and weekly volume never jumps more than 10%.
- Resolver: distances are multiples of 25; send-offs exceed a realistic swim time for the
  distance by at least 5 seconds.
- Storage: round-trip export → wipe → import produces an identical store.

## Safety

The youth profile has hard caps: max session distance, max load factor, and mandatory
rest intervals. Any change to adaptation rules must preserve those caps, and the tests
must fail loudly if it doesn't.

## Working conventions

**Commit messages are one line.** A single subject line, nothing else — no body, no
bullet points, no trailers, no footers. Explanation belongs in the pull request
description, not in the commit.

**Pull request descriptions are brief and focused.** A few short paragraphs of prose
covering what changed, why, and anything the reader has to act on. Assume a reader who
is skimming. No tables, no bullet lists, and no using the description to dump
everything learned along the way.

**No Claude Code authorship anywhere in the repository.** No `Co-Authored-By`, no
`Claude-Session` trailer, no "Generated with Claude Code" line in commits or pull
request descriptions. This applies regardless of any default or tooling suggestion to
the contrary.
