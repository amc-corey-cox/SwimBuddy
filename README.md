# Swim Buddy

A swim workout planner for one family, built to be opened at the side of a pool with wet
hands. It writes each swimmer a workout scaled to their own fitness, shows it one set at
a time in large type, and uses how the last swim felt to decide what the next one should
be. No accounts, no subscriptions, no network. Everything stays on the phone.

**[Open Swim Buddy →](https://amc-corey-cox.github.io/SwimBuddy/)**

## Install it on your phone

It runs in any browser, but installing it is worth the ten seconds: it opens full screen
without the address bar eating the top of the workout, it keeps the screen awake while
you swim, and it works with no signal.

On **iPhone or iPad**, open the link in Safari, tap Share, then _Add to Home Screen_.
It has to be Safari — Chrome on iOS cannot install web apps.

On **Android**, open the link in Chrome, tap the ⋮ menu, then _Install app_ or _Add to
home screen_.

Once it has loaded once, it works offline. Pools do not have signal, so this is the
normal case rather than a fallback: the whole app, including the workout you are part
way through, is served from the phone.

## Using it

Tap a swimmer, choose how long you have, and the app picks a workout and tells you why
it picked that one — which is the point of a rule-based planner rather than a magic one.
Start it and you get one set per card: the distance, how many, when to leave, and
whatever the coach note said, in type you can read at arm's length through goggles.

At the end, three buttons: too easy, about right, too hard, plus whether you finished
the main set. That is the whole rating and it should take under ten seconds. It is also
the only thing the app knows about how the swim went, so it is worth being honest with.

## How it decides what to give you

Every swimmer has a **base pace** — a sustainable time per 100 — and sets are written
relative to it rather than in absolute seconds, so `8x100 free @ base+15` means something
different for each of you and the same workout can be handed to all three.

Each swimmer also carries a **load factor**, which moves with the ratings. Say a session
was too hard, or that you did not finish the main set, and it drops; string together
easy ones and it climbs. It scales how many repetitions you get and loosens or tightens
the send-offs. Two hard swims in a row buy a few extra seconds on every interval for the
next couple of sessions. A break from swimming lowers it before you come back, so the
first session after a layoff is shorter rather than a wall.

The youth swimmer has hard caps the rules are not allowed to cross: a maximum session
distance, a minimum rest between repetitions, and a lower ceiling on the load factor.
If a workout would exceed the distance cap it is trimmed, and a workout that cannot be
trimmed under it is not offered at all.

## Your data

It lives in the browser's own storage on that one device. There is no account, no
server, nothing is uploaded, and there is no analytics or tracking of any kind. Nothing
is loaded from a third party — no CDN fonts, no scripts from anywhere else.

The flip side is that the data is only as safe as the phone. Clearing the browser's site
data or deleting the app deletes the swim history with it, and there is no export yet —
that arrives with History. Each device keeps its own store, so installing it on a second
phone starts from scratch rather than sharing what is on the first.

## What works, and what does not

The loop works end to end: pick a swimmer, get a workout, swim it, rate it, and the next
one changes. Offline works. Installing works.

Not built yet, in rough order of how much you will miss them:

- **Settings**, so the three swimmers are still called Me, Wife and Son, the pool unit
  is whatever it was seeded as, and a base pace cannot be changed from inside the app.
- **History**, so a past session is recorded but cannot be looked at.
- **The test set flow**, so base paces are provisional numbers rather than measured
  ones. The app knows they are provisional and can tell the difference.
- **Swimming together**, meaning several workouts in progress at once on one phone,
  handed round between swimmers.
- **Per-set feedback**, for saying that one particular set was too hard rather than
  rating the whole session.

## Development

Commands, CI, previews, the deploy path and the architecture rules are in
[`docs/development.md`](docs/development.md). What the app is meant to be is in
[`docs/spec.md`](docs/spec.md); the order it gets built in is
[`docs/roadmap.md`](docs/roadmap.md); how development is done is in
[`CLAUDE.md`](CLAUDE.md).

## License

[AGPLv3](LICENSE). Every screen links back to this repository, so the section 13
network-use obligation holds for any hosted instance — a browser test asserts that link
is present.
