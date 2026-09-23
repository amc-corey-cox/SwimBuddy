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

export interface WorkoutHandlers {
  /** Moves the whole practice, and everybody in it, to a position. */
  onStep: (index: number) => void
  /** Moves one swimmer without touching anybody else. */
  onStepSwimmer: (swimmer: Swimmer, index: number) => void
  onFinish: () => void
  /** Records that this set was too hard or too easy for one swimmer. */
  onFlag: (swimmer: Swimmer, rating: EffortRating | undefined) => void
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
 * Advancing moves the whole practice: the number being called out is one number.
 */
export function workoutScreen(
  participants: readonly Participant[],
  settings: Settings,
  index: number,
  /** Where each swimmer actually is, which is not always where the practice is. */
  swimmerPositions: ReadonlyMap<string, number>,
  flags: ReadonlyMap<string, EffortRating>,
  handlers: WorkoutHandlers,
): HTMLElement {
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
      : participants.map((participant) =>
          swimmerCard(
            participant,
            positions,
            swimmerPositions.get(participant.swimmer.id) ?? index,
            index,
            settings,
            flags,
            handlers,
          ),
        )),
    el('div', { class: 'row' }, [
      button(
        '‹ Prev',
        () => {
          handlers.onStep(index - 1)
        },
        { class: 'link', 'data-testid': 'prev', ...(index === 0 ? { disabled: 'true' } : {}) },
      ),
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
 * The positions a practice steps through.
 *
 * Taken from whichever swimmer has the most sets, because the youth distance cap
 * can trim somebody's workout shorter than the rest. The whiteboard still has the
 * whole thing on it; a swimmer whose version stopped earlier is simply done, and
 * their row says so rather than inventing a set for them.
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

  return [setCard(set, settings)]
}

function setCard(set: ResolvedSet, settings: Settings): HTMLElement {
  return el('article', { class: 'card', 'data-testid': 'set-card' }, [
    ...setLines(set, 'headline'),
    el('p', { class: 'muted unit' }, [settings.pool_unit]),
  ])
}

/**
 * One swimmer's version of the current set, with the two taps that record how it
 * went for them.
 *
 * Flagging is never required. A practice where nobody taps anything still ends
 * with a workout recorded for everyone — the flag is a strong signal precisely
 * because it is only used when something was actually wrong.
 */
function swimmerCard(
  participant: Participant,
  positions: readonly Position[],
  own: number,
  practice: number,
  settings: Settings,
  flags: ReadonlyMap<string, EffortRating>,
  handlers: WorkoutHandlers,
): HTMLElement {
  const { swimmer } = participant
  const position = positions[own]
  const set = position === undefined ? undefined : setAt(participant.workout, position)
  const flag = flags.get(swimmer.id)
  const behind = own - practice

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

  if (set === undefined) {
    return el('article', { class: 'card card-done', 'data-testid': `set-card-${swimmer.id}` }, [
      header,
      el('p', { class: 'muted' }, ['Done — past the end of their workout.']),
    ])
  }

  return el('article', { class: 'card', 'data-testid': `set-card-${swimmer.id}` }, [
    header,
    ...setLines(set, 'headline-small'),
    el('div', { class: 'chips' }, [
      flagChip(swimmer, 'too_easy', 'Too easy', flag, handlers),
      flagChip(swimmer, 'too_hard', 'Too hard', flag, handlers),
    ]),
    el('p', { class: 'muted unit' }, [settings.pool_unit]),
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
