# Swim Buddy

Swim Buddy writes each swimmer their own workout, shows it one set at a time in type you
can read through goggles, and uses how the last swim felt to decide what the next one
should be.

## Why this exists

People who swim together are rarely the same swimmer. In one family that is an
ex-swim-team adult thirty years out of the water who wants real sets, someone who swims
for fitness, and an eleven-year-old who will quietly stop turning up if it feels like a
grind. In a masters lane or a small squad it is the same problem with more people in it.
The same workout on the whiteboard is either too much for somebody or too little for
somebody else, and writing one per swimmer by hand before every session is the kind of
thing that happens twice and then stops.

So the workouts are written once, relative to each swimmer rather than in absolute
seconds, and the app does the arithmetic per person. A set that reads `8x100 free @
base+15` becomes a different send-off for each of you from the same line.

It is rule-based rather than clever on purpose. Every workout comes with the reasons it
was chosen, in words, on the screen — because a planner you cannot argue with is one you
stop trusting the first time it hands you something stupid. There is no model in here
and nothing is learned; the rules are written down in the spec and you can go and read
why you got what you got.

And it is local-first because of where it gets used. Pools have no signal, phones get
wet, and nobody wants an account and a subscription to be told to swim 8x100. Everything
lives on the phone, nothing is uploaded, there is no analytics of any kind, and the whole
app works with the radio off.

**[Open Swim Buddy →](https://amc-corey-cox.github.io/SwimBuddy/)**

## Install it on your phone

It runs fine in a browser tab, but installing it is worth the ten seconds: it opens full
screen without the address bar eating the top of the workout, it holds the screen awake
while you swim, and it works with no signal.

On **iPhone or iPad**, open the link in Safari, tap Share, then _Add to Home Screen_. It
has to be Safari — Chrome on iOS cannot install web apps.

On **Android**, open the link in Chrome, tap the ⋮ menu, then _Install app_ or _Add to
home screen_.

Once it has loaded once it works offline, including a workout you are part way through.
The first run creates the three swimmers and the workout library on the device, so there
is nothing to sign up for and nothing to download again.

## Using it

**Who is swimming?** — the opening screen is one big tile per swimmer. Tap yours.

**Your swim** — pick how long you have: 30, 45, 60 or 75 minutes. The app names the
workout it chose and lists why underneath, mixing the reasons from the choice itself with
the reasons from your recent swims: that you had a hard one last time, that you have not
done drills lately, that you have been out of the water for a fortnight and this is a
deliberately shorter way back. Change the length and it chooses again. If nothing fits —
which happens when the week's volume is already used up, or when no workout can be
brought under the youth distance cap — it says so rather than inventing something.

**The workout** — one set per card, and everything on it is already a number. A card
shows the repetitions and distance large at the top, then whatever the set asked for
underneath: the stroke, drill or kick, any equipment, `Leave on 1:45` for the send-off,
`Hold 1:30` if the set also prescribes a pace, and the coach's note if there is one. A
line at the top tells you which section you are in and how far through you are. Prev and
Next step between cards, and the last card's button says Finish. The screen stays awake
the whole time.

You never see a formula. `base+15` is resolved to a clock time before it reaches the
card, because doing arithmetic at the wall with water in your eyes is not swimming.

**How was it?** — three buttons: too easy, about right, too hard. There is a toggle for
whether you finished the main set, which starts on "finished" so that tapping one button
and putting the phone down still records something true, and the youth swimmer also gets
a thumbs up or down for whether it was any fun. Tapping an effort button saves the
session and returns to the tiles. That is the entire rating and it is meant to take under
ten seconds.

## How it decides what to give you

Every swimmer has a **base pace**, a sustainable time per 100, measured from a timed 400
and a timed 200. Sets are authored against it, which is what lets one workout serve three
people.

Each swimmer also carries a **load factor** that moves with the ratings. Say a session
was too hard, or that you cut the main set short, and it drops; string together easy ones
and it climbs. It decides how many repetitions you get where a workout allows a range,
and it loosens or tightens the send-offs. Backing off is never postponed — one hard
session lowers it even if the swim before was easy.

A few rules sit on top of that. Two hard swims in a row buy a few seconds on every
send-off for the next couple of sessions. Coming back from a break starts you shorter.
The week's volume cannot jump more than ten percent over the previous week's, which is
what stops a run of good ratings turning into an injury. And the app will not give you
two hard sessions back to back, or the same kind of workout you did last time if it can
help it.

The youth swimmer has hard caps the rules may not cross: a maximum session distance, a
minimum rest between repetitions, and a lower ceiling on the load factor. A workout over
the distance cap is trimmed; one that cannot be trimmed under it is not offered.

## Your data

It lives in the browser's own storage on that one device. No account, no server, nothing
uploaded, no analytics, and nothing loaded from a third party — no CDN, no fonts from
anywhere else.

The flip side is that the data is only as safe as the phone. Clearing the browser's site
data or deleting the app takes the swim history with it, and there is no export yet — that
arrives with History. Each device keeps its own store, so a second phone starts empty
rather than sharing what is on the first.

## What works, and what does not

The loop works end to end: pick a swimmer, get a workout, swim it, rate it, and the next
one changes. Offline works. Installing works.

Not built yet, in rough order of how much you will miss them:

- **The roster**, so swimmers cannot be added, renamed or marked adult or youth. The
  three that exist are still called Me, Wife and Son.
- **Swimming together**, where one phone gets passed around a practice — everybody on the
  same workout resolved to their own numbers, with whoever is holding it recording how
  each of them is going.
- **Settings**, so the pool unit is whatever it was seeded as and a base pace cannot be
  changed from inside the app.
- **History**, so a past session is recorded but cannot be looked at.
- **The test set flow**, so base paces are provisional numbers rather than measured ones.
  The app knows they are provisional and can tell the difference.
- **Per-set feedback**, for saying that one particular set was too hard rather than
  rating the whole session.

A workout in progress also lives in memory rather than storage, so leaving the screen
loses it. That is the first thing the practice work fixes.

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
