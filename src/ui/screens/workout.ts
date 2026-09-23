import { el, button } from '../dom'
import { clock, extent, repetitions } from '../format'
import type {
  EffortRating,
  ResolvedSet,
  ResolvedWorkout,
  Settings,
  Swimmer,
} from '../../core/types'

export interface Participant {
  readonly swimmer: Swimmer
  readonly workout: ResolvedWorkout
}

/** Everything the screen draws. An options object, because it is a lot of state. */
export interface WorkoutView {
  readonly participants: readonly Participant[]
  readonly settings: Settings
  /** The set being called out. */
  readonly index: number
  /** Where each swimmer actually is, which is not always where the practice is. */
  readonly positions: ReadonlyMap<string, number>
  readonly flags: ReadonlyMap<string, EffortRating>
  /** Swimmers who did not finish the set they are on. */
  readonly unfinished: ReadonlySet<string>
  /** Roster members not in this practice, who can still join it. */
  readonly available: readonly Swimmer[]
}

export interface WorkoutHandlers {
  /** Moves the whole practice, and everybody in it, to a position. */
  onStep: (index: number) => void
  /** Moves one swimmer without touching anybody else. */
  onStepSwimmer: (swimmer: Swimmer, index: number) => void
  onFinish: () => void
  /** Stops here, recording what everybody actually swam. */
  onEnd: () => void
  /** Records that this set was too hard or too easy for one swimmer. */
  onFlag: (swimmer: Swimmer, rating: EffortRating | undefined) => void
  /** Records that one swimmer did not finish the set they are on. */
  onUnfinished: (swimmer: Swimmer, unfinished: boolean) => void
  /** Somebody got out. What they swam so far still counts. */
  onLeave: (swimmer: Swimmer) => void
  /** Somebody turned up late and joins where the practice already is. */
  onJoin: (swimmer: Swimmer) => void
}

/** Where a set sits in a workout. Positions line up across swimmers. */
interface Position {
  readonly section: string
  readonly sectionIndex: number
  readonly setIndex: number
}

/**
 * The screen that matters: the set everybody is on, at arm's length, on a wet
 * phone.
 *
 * Everything here is already a number. The spec is explicit that resolved
 * distances and send-off times are what appear, never the formula they came
 * from, so nothing on this screen knows what a base pace is.
 *
 * With more than one swimmer the card grows a row each, because a send-off
 * differs per person and whoever is calling the set needs all of them at once.
 */
export function workoutScreen(view: WorkoutView, handlers: WorkoutHandlers): HTMLElement {
  const { participants, settings, index } = view
  const positions = positionsFor(participants)
  const current = positions[index]

  if (current === undefined) {
    return el('section', { class: 'screen', 'data-testid': 'screen-workout' }, [
      el('p', {}, ['This workout has no sets.']),
      button('Done', handlers.onFinish, { class: 'primary', 'data-testid': 'finish' }),
    ])
  }

  const last = index === positions.length - 1
  const solo = participants.length === 1

  return el('section', { class: 'screen workout', 'data-testid': 'screen-workout' }, [
    el('p', { class: 'progress', 'data-testid': 'progress' }, [
      `${current.section} · ${String(index + 1)} of ${String(positions.length)}`,
    ]),
    ...(solo
      ? soloCard(participants, current, settings)
      : participants.map((participant) => swimmerCard(participant, positions, view, handlers))),
    ...joinRow(view, handlers),
    el('div', { class: 'row' }, [
      button(
        '‹ Prev',
        () => {
          handlers.onStep(index - 1)
        },
        { class: 'link', 'data-testid': 'prev', ...(index === 0 ? { disabled: 'true' } : {}) },
      ),
      endControl(handlers),
      last
        ? button('Finish', handlers.onFinish, { class: 'primary', 'data-testid': 'finish' })
        : button(
            'Next ›',
            () => {
              handlers.onStep(index + 1)
            },
            { class: 'primary', 'data-testid': 'next' },
          ),
    ]),
  ])
}

/**
 * Stopping before the end.
 *
 * Pool time runs out, a child has had enough, somebody has to be somewhere. The
 * swim still happened, so this records what everybody actually swam rather than
 * throwing the session away — which is what leaving the screen used to do.
 *
 * Two taps, for the same reason the reset control takes two: the second tap is
 * the confirmation, and it reads at arm's length on a wet screen.
 */
function endControl(handlers: WorkoutHandlers): HTMLButtonElement {
  let armed = false

  const control = button(
    'End',
    () => {
      if (!armed) {
        armed = true
        control.textContent = 'End it?'
        control.classList.add('armed')
        return
      }
      handlers.onEnd()
    },
    { class: 'link end', 'data-testid': 'end-practice' },
  )

  return control
}

/** Somebody who turned up late, joining where the practice already is. */
function joinRow(view: WorkoutView, handlers: WorkoutHandlers): HTMLElement[] {
  if (view.available.length === 0) return []

  return [
    el(
      'div',
      { class: 'chips join', 'data-testid': 'join-row' },
      view.available.map((swimmer) =>
        button(
          `+ ${swimmer.name}`,
          () => {
            handlers.onJoin(swimmer)
          },
          { class: 'chip', 'data-testid': `join-${swimmer.id}` },
        ),
      ),
    ),
  ]
}

/**
 * The positions a practice steps through.
 *
 * Taken from whichever swimmer has the most sets, because the youth distance cap
 * can trim somebody's workout shorter than the rest. The whiteboard still has the
 * whole thing on it; a swimmer whose version stopped earlier is simply done, and
 * their card says so rather than inventing a set for them.
 */
function positionsFor(participants: readonly Participant[]): readonly Position[] {
  let longest: readonly Position[] = []

  for (const participant of participants) {
    const positions = participant.workout.sections.flatMap((section, sectionIndex) =>
      section.sets.map((_set, setIndex) => ({ section: section.name, sectionIndex, setIndex })),
    )
    if (positions.length > longest.length) longest = positions
  }

  return longest
}

function setAt(workout: ResolvedWorkout, position: Position): ResolvedSet | undefined {
  return workout.sections[position.sectionIndex]?.sets[position.setIndex]
}

function soloCard(
  participants: readonly Participant[],
  position: Position,
  settings: Settings,
): HTMLElement[] {
  const participant = participants[0]
  if (participant === undefined) return []

  const set = setAt(participant.workout, position)
  if (set === undefined) return []

  return [
    el('article', { class: 'card', 'data-testid': 'set-card' }, [
      ...setLines(set, 'headline'),
      el('p', { class: 'muted unit' }, [settings.pool_unit]),
    ]),
  ]
}

/**
 * One swimmer's version of the set they are on, with the taps that record how it
 * went for them.
 *
 * None of it is required. A practice where nobody taps anything still ends with a
 * workout recorded for everyone — a flag is a strong signal precisely because it
 * is only used when something was actually worth saying.
 */
function swimmerCard(
  participant: Participant,
  positions: readonly Position[],
  view: WorkoutView,
  handlers: WorkoutHandlers,
): HTMLElement {
  const { swimmer } = participant
  const own = view.positions.get(swimmer.id) ?? view.index
  const position = positions[own]
  const set = position === undefined ? undefined : setAt(participant.workout, position)
  const flag = view.flags.get(swimmer.id)
  const behind = own - view.index

  const header = el('div', { class: 'swimmer-head' }, [
    el('p', { class: 'swimmer-name', 'data-testid': `set-swimmer-${swimmer.id}` }, [swimmer.name]),
    ...(behind === 0
      ? []
      : [
          el('span', { class: 'drift', 'data-testid': `drift-${swimmer.id}` }, [
            behind < 0 ? `${String(-behind)} behind` : `${String(behind)} ahead`,
          ]),
        ]),
    nudge(swimmer, own - 1, '‹', own === 0, handlers),
    nudge(swimmer, own + 1, '›', own >= positions.length, handlers),
  ])

  const leave = button(
    'Got out',
    () => {
      handlers.onLeave(swimmer)
    },
    { class: 'link danger small', 'data-testid': `leave-${swimmer.id}` },
  )

  if (set === undefined) {
    return el('article', { class: 'card card-done', 'data-testid': `set-card-${swimmer.id}` }, [
      header,
      el('p', { class: 'muted' }, ['Done — past the end of their workout.']),
      leave,
    ])
  }

  return el('article', { class: 'card', 'data-testid': `set-card-${swimmer.id}` }, [
    header,
    ...setLines(set, 'headline-small'),
    el('div', { class: 'chips' }, [
      flagChip(swimmer, 'too_easy', 'Too easy', flag, handlers),
      flagChip(swimmer, 'too_hard', 'Too hard', flag, handlers),
      unfinishedChip(swimmer, view.unfinished.has(swimmer.id), handlers),
    ]),
    el('div', { class: 'card-foot' }, [
      el('p', { class: 'muted unit' }, [view.settings.pool_unit]),
      leave,
    ]),
  ])
}

/**
 * Moves one swimmer without moving the practice.
 *
 * Balancing gets everybody finishing a set at roughly the same time, not exactly,
 * and somebody always stops for goggles. The set being called out is still one
 * number — that is what the practice controls are for — but a swimmer who is a
 * set behind should be looking at the set they are actually swimming.
 */
function nudge(
  swimmer: Swimmer,
  to: number,
  label: string,
  disabled: boolean,
  handlers: WorkoutHandlers,
): HTMLButtonElement {
  return button(
    label,
    () => {
      handlers.onStepSwimmer(swimmer, to)
    },
    {
      class: 'nudge',
      'data-testid': `nudge-${label === '‹' ? 'back' : 'on'}-${swimmer.id}`,
      'aria-label': `${label === '‹' ? 'Move back' : 'Move on'}: ${swimmer.name}`,
      ...(disabled ? { disabled: 'true' } : {}),
    },
  )
}

function flagChip(
  swimmer: Swimmer,
  rating: EffortRating,
  label: string,
  current: EffortRating | undefined,
  handlers: WorkoutHandlers,
): HTMLButtonElement {
  const on = current === rating
  return button(
    label,
    () => {
      handlers.onFlag(swimmer, on ? undefined : rating)
    },
    {
      class: on ? 'chip chip-on' : 'chip',
      'data-testid': `flag-${rating}-${swimmer.id}`,
      'aria-pressed': on ? 'true' : 'false',
    },
  )
}

/**
 * Did not finish this set.
 *
 * Kept separate from "too hard" rather than folded into it, because they are
 * different facts and only one of them is about the set. A swimmer stops for a
 * cramp, for the clock, or because somebody has to leave; a set being too hard is
 * a judgement about the set. Where they do coincide the app joins them up: any
 * unfinished set means the post-swim screen opens on "cut it short" already
 * chosen, which is the answer the adaptation rules actually read.
 */
function unfinishedChip(
  swimmer: Swimmer,
  on: boolean,
  handlers: WorkoutHandlers,
): HTMLButtonElement {
  return button(
    'Did not finish',
    () => {
      handlers.onUnfinished(swimmer, !on)
    },
    {
      class: on ? 'chip chip-on' : 'chip',
      'data-testid': `flag-unfinished-${swimmer.id}`,
      'aria-pressed': on ? 'true' : 'false',
    },
  )
}

/** The set itself: what to swim, when to leave, how fast, and the coach's note. */
function setLines(set: ResolvedSet, headlineClass: string): HTMLElement[] {
  const first = set.parts[0]
  const descriptors = set.parts
    .map((part) => part.descriptor)
    .filter((text) => text.length > 0)
    .join(' / ')

  return [
    el('p', { class: headlineClass, 'data-testid': 'headline' }, [
      repetitions(set.reps, extent(first)),
    ]),
    ...(descriptors.length > 0
      ? [el('p', { class: 'descriptor', 'data-testid': 'descriptor' }, [descriptors])]
      : []),
    ...(set.send_off_seconds === undefined
      ? []
      : [
          el('p', { class: 'sendoff', 'data-testid': 'send-off' }, [
            `Leave on ${clock(set.send_off_seconds)}`,
          ]),
        ]),
    ...(set.pace_seconds === undefined
      ? []
      : [el('p', { class: 'pace', 'data-testid': 'pace' }, [`Hold ${clock(set.pace_seconds)}`])]),
    ...(set.note === undefined ? [] : [el('p', { class: 'note' }, [set.note])]),
  ]
}
