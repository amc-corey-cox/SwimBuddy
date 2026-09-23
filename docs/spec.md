# Swim Buddy — Project Spec

A local-first swim workout PWA for a small group of swimmers — a family, a masters lane,
a squad — sharing one phone at the end of the lane. Generates workouts scaled to each
swimmer's fitness and adapts them based on post-swim feedback. No accounts, no telemetry,
no subscriptions. Works offline at the pool.

**License: AGPLv3.** A `LICENSE` file goes in the first commit. Every page must link to
the source repo (footer or About screen) so the AGPL §13 network-use obligation is
satisfied from day one — a backend is planned, see "Future backend" below.

## Users

A **roster** of swimmers, entered by whoever set the app up. There is no fixed number and
no fixed household: a swimmer is a name, a base pace and whether they are youth. The last
two are chosen when the swimmer is added and editable after.

There is deliberately no date of birth. Age itself drives nothing — every rule that cares
reads the youth flag — so storing one would mean holding a child's date of birth on a
phone to derive a boolean somebody already typed. The flag is the whole of it.

Swimmers come in two kinds, and the only thing that distinguishes them is which safety
rules apply:

| Kind  | Means                                                                         |
| ----- | ----------------------------------------------------------------------------- |
| Adult | No session distance cap, load factor up to 1.4, 5s minimum rest.              |
| Youth | Hard caps on distance, load factor and rest. See Safety. Must not be a grind. |

The app runs on one device that gets passed around. Whoever is holding it taps what
happened — their own swim, or somebody else's. There is no coach mode, no sign-in and no
notion of who is looking at the screen: a phone sitting on a kickboard at the end of a
lane does not know who picked it up, and it should not pretend to.

Somebody usually ends up holding it more than the others, and that person is a coach in
every sense except the one that would matter here. They are entering data. Building a
role around them would buy a distinction the app cannot observe and would have to ask
about, and asking is the cost. One swimmer alone is the same thing with the passing
around left out — not a separate mode, just a practice with one person in it.

A roster is not an attendance list. Some of the roster is there and some is not, somebody
turns up who has never used it before, and somebody gets out after the main set. So who
is swimming today is chosen when a practice starts rather than configured in advance, a
new swimmer can be added from that same screen without going anywhere else, and a
practice can gain or lose a swimmer after it has begun.

The motivating roster, and the one the fixtures are built from: an ex-swim-team adult
thirty years out of the water who wants real sets, an adult fitness swimmer, and an
eleven-year-old who needs variety and drills.

## Non-goals (v1)

- No watch integration, stroke detection, or automatic lap counting.
- No login, no accounts, no cloud sync.
- One roster per device. No multiple teams, no swimmer belonging to two rosters.
- No lane or training-group split within a practice: one practice, one arrangement.
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
- For youth swimmers use a 200/100 test and do not push maximal effort.

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
  4x50 free build 1-4 @ base+25

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
an optional **pace**, an optional **pattern**, an optional **structure**, and an optional
coaching note.

Interval and pace are different instructions and a swimmer can be given both: `@ base+15`
says when to leave, `hold 1:20` says how fast to swim it. Both are optional — plenty of
sets prescribe neither — and both are written the same way, as `base±N` or a clock time.

Each part carries:

- **extent** — a distance in pool units _or_ a duration in seconds. Never both.
- **activity** — an entry from the catalogue below.
- **equipment** — nothing, or several entries from the equipment catalogue. Fins and a
  snorkel at the same time is an ordinary thing to be asked for, so this is a list.
- **effort** — a qualitative band. Distinct from pace, which is always a number: "easy"
  is not a time, and no amount of arithmetic turns it into one.

Multiple parts in one set are how `4x75 free drill/swim` is expressed: a 25 of drill
coupled to a 50 of swim, inside a single repetition.

Pattern and structure describe the repetitions rather than the swimming, so they sit on
the set rather than on a part:

- **pattern** — a shape, carrying the **scope** it applies at. `build` is two different
  instructions and the scope is which one is meant: `4x50 build` shapes each repetition,
  easy into the wall and fast off it, while `4x50 build 1-4` shapes the set, each 50
  faster than the one before. A trailing repetition range is what tells them apart.
  `descend` only ever counts repetitions; a negative split only ever happens inside one
  swim. A held pace and a descending series are different instructions and neither
  expresses the other.
- **structure** — `relay`, `partner`, `pace line`: how repetitions are distributed
  between swimmers rather than what is swum. Every structure needs more than one swimmer.

Recognising any of these never consumes the words. The descriptor is kept verbatim
either way, so a term the catalogues do not know still reaches the swimmer exactly as
the author wrote it. The catalogues are examples, and the shorthand has to survive words
they have never seen.

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

### Modifier catalogues

Equipment, effort, pattern and structure are data on the same terms as activities, share
the same shape — a stable id, a display name, and the words an author might write — and
are matched by the same rules. Each carries one field of its own:

| catalogue | entries                                                                    | carries                                                      |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| equipment | board, buoy, fins, paddles, snorkel, band                                  | `implies_mode` — a board means kicking, a buoy means pulling |
| effort    | recovery, easy, steady, strong, threshold, hard, race pace, sprint         | `rank`, easiest to hardest                                   |
| pattern   | build, descend, ascend, alternate, ladder, pyramid, negative split, broken | `scopes` it can carry, the one it means by default first     |
| structure | relay, partner, pace line                                                  | `min_swimmers`                                               |

`rank` exists so a selection rule can ask which of two sets is harder without parsing
English. It is an ordering and never a pace; the gap between two ranks means nothing.

No modifier may claim a word an activity already means. A word has one meaning per
descriptor, or `50 kick` parses two ways depending on which catalogue was read first.

Parser requirements:

- Parse `NxD activity modifiers @ interval`, where the extent is a distance or a clock
  duration. Intervals: `base+N`, `base-N`, `base`, or a literal like `1:30`.
- `{reps:MIN-MAX}` resolves per swimmer from their load factor.
- Distances round to the nearest 25. Durations do not.
- `hold <pace>` sets a pace target, written like an interval. It is only read as one when
  what follows is a pace, so "hold the wall" stays in the descriptor.
- Modifiers are recognised inside the descriptor and never removed from it. Recognition
  is additive: the words survive whether or not a catalogue knows them.
- A pattern followed by a repetition range — `descend 1-4` — is a shape across the set.
  Without one it is a shape within each repetition, where the pattern allows both. A
  range on a pattern whose scope cannot carry one is left in the descriptor rather than
  recorded as a span that means nothing.
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
- (Youth only) **Fun**: thumbs up / down

Whoever is holding the phone enters that, which may or may not be the swimmer it is
about. The app does not distinguish the two and does not try to.

Rules:

- Two consecutive "too easy" + completed → `load_factor *= 1.05`
- One "too hard" or "cut it short" → `load_factor *= 0.95`
- Two consecutive "too hard" → also add +3s to send-offs for the next 2 sessions
- Weekly total volume may not exceed the trailing week by more than 10%, regardless.
- A set measured in time rather than distance counts toward volume as the distance an
  easy swim would cover in that time. Approximate on purpose: it keeps one volume number
  meaningful without pretending treading water is swimming.
- Over 10 days since last swim → drop `load_factor` 10% and pick a shorter template.
- Youth swimmers: cap `load_factor` at 1.15; two consecutive thumbs-down biases selection
  toward drill/fun tags.

Template selection: prefer tags unused in the last 3 sessions, respect requested session
length, and never schedule two `intensity: hard` templates back to back.

Selection picks **one** arrangement for everybody in the practice rather than one each,
because a practice is a whiteboard and a whiteboard has one workout on it. The
arrangement is then resolved per swimmer, so the numbers differ while the shape does not.
A candidate is only eligible if every swimmer in the practice can be given it safely —
one the youth distance cap cannot trim is not offered to a practice that includes a youth
swimmer, exactly as it is not offered to that swimmer alone. Scoring is against the
practice: the rules above are evaluated per swimmer and the worst score wins, so one
person who did a hard session yesterday is enough to steer the whole practice off a hard
one. Adaptation still runs per swimmer — the shared thing is the arrangement, never the
load factor.

## Data model

The model below is not maintained by hand. `schema/swimbuddy.yaml` is a LinkML schema
and is the source of truth; the TypeScript types and a JSON Schema are generated from
it. This section is the shape in prose — when the two disagree, the schema is right and
this is stale.

```
Swimmer   { id, name, base_pace_by_stroke, load_factor, is_youth }
Activity  { id, name, aliases, paced, stroke_group, mode, extent_kind: distance|time|either }
Equipment { id, name, aliases, implies_mode }
EffortBand{ id, name, aliases, rank }
Pattern   { id, name, aliases, scopes }
Structure { id, name, aliases, min_swimmers }
Template  { id, name, tags, intensity, level_range, raw_text, parsed_sets }
Practice  { id, template_id, date, position, finished, participants[] }
            participant { swimmer_id, resolved_sets, total_distance, position,
                          session_id }
Session   { id, swimmer_id, template_id, practice_id, date, resolved_sets,
            total_distance, effort_rating, completed, fun_rating,
            set_feedback[], notes }
            set_feedback { section_index, set_index, effort_rating }
TestSet   { id, swimmer_id, date, protocol: 400/200|200/100, t400, t200,
            computed_base_pace }
Settings  { pool_unit: yards|meters, pool_length }
```

`Activity` and the four modifier catalogues are seeded from the shipped data and stored
like any other record, so a new activity — or a new piece of kit — is data a swimmer can
add rather than a release.

`TestSet.protocol` records which pair of swims the times are, because adults swim a
400/200 and youth a 200/100, and the two compute base pace differently.

A **Practice** is one visit to the pool by one or more swimmers doing one arrangement. It
exists so a workout in progress survives the phone being locked, handed to somebody else
or dropped in a bag — today a swim lives in memory and leaving the screen loses it, which
is indefensible once that phone holds the only copy of four people's practice. It holds
each participant's resolved workout and their own position in it, so whoever has the
phone can move between swimmers freely and nobody loses their place. One swimmer is a
practice with one participant; there is no second code path.

Participants are not fixed at the start. Somebody who arrives after the warmup joins the
practice they are already partway through, and somebody who gets out early leaves it —
both of which write a session for what they actually swam rather than discarding it.

`Practice.position` is where the practice as a whole has got to, which is the number
being called out; a participant's own position is where that swimmer actually is, because
somebody always falls behind. A session is written per participant when they finish, so
history stays per swimmer and the adaptation rules are untouched by any of this.

`set_feedback` records that one particular set was too hard or too easy, pointing at a
set by its position within that session's own `resolved_sets`, which cannot dangle
because the sets are stored alongside it. It is expected to be sparse — most sets get no
comment, and the ones that do are worth more for it. Set feedback is stored and shown in
History and deliberately does **not** feed the adaptation rules yet: the rules should be
written against real history rather than thresholds invented before any exists.

There is deliberately no record of who entered a rating. An earlier draft had one, on the
grounds that somebody else's observation is not the same signal as a swimmer's own report.
That is true and it does not help: the device is passed around and cannot tell which it
got, so the field could only be filled by asking, and a question at the end of every swim
to populate a column nothing reads yet is a bad trade. A field the app cannot observe
honestly is worse than no field.

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

Export/import the entire store as one JSON file — the only "sync" in v1. The generated
JSON Schema has `StoreSnapshot` as its tree root, so it validates that file directly: an
import is checked before it is trusted, rather than after it has overwritten something.

## Screens (v1)

1. **Who is swimming** — a tile per swimmer on the roster, tapped to include them today.
   One is a practice of one; four is a practice of four. Nothing else distinguishes
   them. Adding a swimmer happens here too, because the moment you need one is when
   somebody has just turned up.
2. **Pre-practice** — session length (30/45/60/75 min) + optional focus. Names the one
   arrangement it chose for the practice and why.
3. **Workout view** — the screen that matters. Large high-contrast text readable on a wet
   phone at arm's length. Wake lock on. One set per card, swipe between. Show resolved
   distances and send-off times, never formulas. With more than one swimmer in the
   practice the card carries a row each, because a send-off differs per person and
   whoever is calling the set needs all of them at once. Tapping a row records that this
   set was too hard or too easy for that swimmer; tapping a name opens their own workout
   at their own position and comes back. None of it is required — a practice where
   nobody taps anything still ends with a workout recorded for everyone.
4. **Post-swim** — three big rating buttons plus optional note, under 10 seconds, once
   per swimmer.
5. **Roster** — add a swimmer, name them, choose adult or youth, set a base pace, remove
   them. Reachable from screen 1 rather than buried in settings, because the roster
   changes at the pool and not at a desk. The one screen without which a team cannot
   exist, and the reason the swimmers are still called Me, Wife and Son.
6. **History** — sessions per swimmer, total distance, weekly volume chart, and any sets
   flagged during a practice.
7. **Settings** — pool unit/length, test set entry, JSON export/import, link to source.

Screens 1 to 4 are built for a single swimmer. The multi-swimmer half of 1 and 3, the
roster and History and Settings are not, so a swimmer cannot be named or added, the pool
unit is whatever seeding set, and a base pace can only be changed by editing storage. A
workout in progress is held in memory: leaving the workout screen loses it, which is why
the wake lock matters and why a session is only written once it has been rated. The
Practice record is what fixes that, and it is a prerequisite for the multi-swimmer card
rather than a nicety — the phone holding four people's practice is the only copy of it,
and a screen lock should not be able to end it.

## Future backend (not v1 — do not build it yet)

A small sync server may follow: a shared template library, syncing the devices on a
roster, several phones showing the same practice at once. That last one is the only
reason multi-device matters — the phone being passed around already holds the whole
practice, and sync is what would let somebody follow it from their own.
Keep the door open without building it:

- All business logic (parser, resolver, adaptation rules) lives in `src/core/` as pure
  functions with zero DOM and zero storage imports, so it can run server-side unchanged.
- Storage access goes through a single `src/storage/` interface. No component touches
  IndexedDB directly.
- No feature may depend on the network. Offline stays the default forever.
- AGPLv3 already covers a future hosted instance; that is why it was chosen over GPLv3.

## Safety

The youth profile has hard caps. Any change to the resolver or the adaptation rules must
preserve them, and the tests must fail loudly if it doesn't.

| Cap                  | Youth | Adult | Why                                                   |
| -------------------- | ----- | ----- | ----------------------------------------------------- |
| Max session distance | 1500  | none  | An 11-year-old fitness swimmer, not an age-grouper.   |
| Max `load_factor`    | 1.15  | 1.4   | Already in the adaptation rules.                      |
| Minimum rest         | 15s   | 5s    | Rest left after a realistic swim time for the extent. |

Only the load factor was a number in the spec before the resolver was written. The other
two were named but never defined, so the distance cap and the rest minimums above were
chosen during implementation and **want the author's sign-off**. The reasoning: 1500 is
comfortably under a typical age-group practice and matches "must not feel like a grind";
15 seconds is enough that a youth swimmer is resting rather than chasing a send-off they
cannot make. Both live in one place, `src/core/safety.ts`, so changing them is a
one-line decision rather than a hunt.

Distance caps apply to the resolved session. A template that would resolve past the cap
has its repetition counts reduced first, and is truncated only if that is not enough —
losing the end of a workout is better than handing a child one they should not swim.

Which caps apply is decided by one flag on the swimmer, chosen when they are added to the
roster. That makes it a setting someone can get wrong, so the roster screen asks plainly
and the flag is what every rule reads. There is no date of birth to infer it from and no
second place where age is interpreted, which is the point: one answer, given once, read
everywhere. Across a practice the caps are the
strictest of everyone in it for anything shared: an arrangement no youth swimmer can be
given safely is not offered to a practice containing one, even though the adults in it
could swim it. Each swimmer's own resolved workout is then capped for them individually,
so an adult in that practice is not held to a child's limits.
