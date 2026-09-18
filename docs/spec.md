# Swim Buddy — Project Spec

A local-first swim workout PWA for a family of three. Generates workouts scaled to each
swimmer's fitness and adapts them based on post-swim feedback. No accounts, no telemetry,
no subscriptions. Works offline at the pool.

**License: AGPLv3.** A `LICENSE` file goes in the first commit. Every page must link to
the source repo (footer or About screen) so the AGPL §13 network-use obligation is
satisfied from day one — a backend is planned, see "Future backend" below.

## Users

| Swimmer  | Notes                                                            |
| -------- | ---------------------------------------------------------------- |
| Me       | Ex-swim-team, ~30 years out of the water. Wants real sets.       |
| Wife     | Fitness swimmer.                                                 |
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

A workout is an **arrangement**: named sections — warmup, drill, main, cooldown — holding
sets in order. Arrangements are authored by hand. A composer that assembles a session
from scratch is deferred: sensible defaults over this matrix are hard, and getting them
wrong produces workouts nobody wants to swim.

Variety comes from the model, not from the size of the library. A 1000 fly is a catalogue
entry and a distance, not a new hand-authored template. The library of arrangements stays
deliberately small.

Templates are authored in swim shorthand and parsed into the structure below. The
shorthand is the authoring convenience; the structure is what the app operates on.

```
name: Aerobic base — free
tags: endurance, free
intensity: moderate
level: 2-4

warmup:
  300 free easy
  4x50 free @ base+25    # build 1-4

drill:
  4x75 free drill/swim @ base+30

main:
  {reps:4-8}x100 free @ base+15
  50 easy
  {reps:2-4}x200 free @ base+20

cooldown:
  2x1:00 tread water
  200 choice easy
```

### Sets

A set is a repetition count over one or more **parts**, carrying an optional **interval**,
an optional **pace**, and an optional coaching note.

Interval and pace are different instructions and a swimmer can be given both: `@ base+15`
says when to leave, `hold 1:20` says how fast to swim it. Both are optional — plenty of
sets prescribe neither — and both are written the same way, as `base±N` or a clock time.

Each part carries:

- **extent** — a distance in pool units _or_ a duration in seconds. Never both.
- **activity** — an entry from the catalogue below.
- **equipment** — board, buoy, fins, paddles, snorkel. Optional, repeatable.
- **effort** — easy, build, descend, sprint, race pace. Optional.

Multiple parts in one set are how `4x75 free drill/swim` is expressed: a 25 of drill
coupled to a 50 of swim, inside a single repetition. A set may also carry a **structure**
— `relay`, `partner` — which describes how repetitions are distributed between swimmers
rather than what is swum.

Extent and pacing are independent. `20:00 free` is timed and paced; `4x25 fly` is
distance and paced; `2x1:00 tread water` is timed and unpaced.

### Activities

Activities are data, not code. Adding one is a new row, never a code change. Each entry
says what the activity is and how it is paced:

| id                              | paced | stroke group                       | mode     | extent   |
| ------------------------------- | ----- | ---------------------------------- | -------- | -------- |
| `free`, `back`, `breast`, `fly` | yes   | its own                            | swim     | distance |
| `im`                            | yes   | mixed                              | swim     | distance |
| `choice`                        | yes   | swimmer's own                      | swim     | distance |
| `kick`, `pull`, `drill`         | yes   | takes the stroke it is paired with | as named | distance |
| `corkscrew`                     | yes   | free                               | swim     | distance |
| `underwater_dolphin`            | no    | —                                  | —        | distance |
| `sculling`                      | no    | —                                  | —        | either   |
| `tread_water`, `back_float`     | no    | —                                  | —        | time     |

A **paced** activity takes its send-off from the swimmer's base pace for the relevant
stroke group. An **unpaced** activity has no base-pace send-off; an interval on it is
read literally or omitted.

The catalogue shipped is a set of examples chosen to prove the shape is flexible enough
for the things a swimmer actually does. It is not meant to be exhaustive, and it is not a
library.

Parser requirements:

- Parse `NxD activity modifiers @ interval`, where the extent is a distance or a clock
  duration. Intervals: `base+N`, `base-N`, `base`, or a literal like `1:30`.
- `{reps:MIN-MAX}` resolves per swimmer from their load factor.
- Distances round to the nearest 25. Durations do not.
- `hold <pace>` sets a pace target, written like an interval. It is only read as one when
  what follows is a pace, so "hold the wall" stays in the descriptor.
- Text after `#` is a coaching note, displayed but not parsed.
- Free text is for nuance, never for substance. "Alternate direction every 5 strokes" is
  a note on a corkscrew set; the corkscrew itself is an activity.
- Unparseable lines are preserved verbatim and shown as-is. Never lose content.

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
- A set measured in time rather than distance counts toward volume as the distance an
  easy swim would cover in that time. Approximate on purpose: it keeps one volume number
  meaningful without pretending treading water is swimming.
- Over 10 days since last swim → drop `load_factor` 10% and pick a shorter template.
- Son: cap `load_factor` at 1.15; two consecutive thumbs-down biases selection toward
  drill/fun tags.

Template selection: prefer tags unused in the last 3 sessions, respect requested session
length, and never schedule two `intensity: hard` templates back to back.

## Data model

```
Swimmer   { id, name, birth_year, base_pace_by_stroke, load_factor, is_youth }
Activity  { id, name, paced, stroke_group, mode, extent_kind: distance|time }
Template  { id, name, tags, intensity, level_range, raw_text, parsed_sets }
Session   { id, swimmer_id, template_id, date, resolved_sets, total_distance,
            effort_rating, completed, fun_rating, notes }
TestSet   { id, swimmer_id, date, protocol: 400/200|200/100, t400, t200,
            computed_base_pace }
Settings  { pool_unit: yards|meters, pool_length }
```

`Activity` is seeded from the shipped catalogue and stored like any other record, so a
new activity is data a swimmer can add rather than a release.

`TestSet.protocol` records which pair of swims the times are, because adults swim a
400/200 and youth a 200/100, and the two compute base pace differently.

`Session.total_distance` includes the easy-swim equivalent of any time-measured sets, so
one number remains comparable week to week. That estimate is the answer, not a placeholder:
recording the distance actually covered in a timed swim would mean counting laps for twenty
minutes, and automatic lap counting is a stated non-goal.

Swims are not measured. A session records how it felt — too easy, about right, too hard,
and whether the main set was finished — and the adaptation rules run off that. Recording a
time for a distance belongs to the base pace test and nowhere else.

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

## Safety

The youth profile has hard caps: max session distance, max load factor, and mandatory
rest intervals. Any change to adaptation rules must preserve those caps, and the tests
must fail loudly if it doesn't.
