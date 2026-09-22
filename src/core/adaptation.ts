import { capsFor, clampLoadFactor } from './safety'
import type { Session, Swimmer, Timestamp } from './types'

/**
 * What the last few swims say about the next one.
 *
 * Rule-based and legible, as the spec insists: every number below traces to a
 * line in "Adaptation logic", and the whole thing is a pure function of the
 * sessions already recorded. Nothing here is fitted to anything.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** Too easy twice running earns more work; anything hard takes some away. */
const EASIER_STEP = 1.05
const HARDER_STEP = 0.95

/** Ten days out of the water, and the next session starts lower. */
const LAYOFF_DAYS = 10
const LAYOFF_STEP = 0.9

/** Seconds added to every send-off after two hard sessions running. */
const RELIEF_SECONDS = 3

/** How many sessions that relief lasts. */
const RELIEF_SESSIONS = 2

/** Weekly volume may exceed the trailing week by this much and no more. */
const WEEKLY_GROWTH = 1.1

export interface Adaptation {
  readonly load_factor: number
  /** Added to every resolved send-off, giving a struggling swimmer room. */
  readonly send_off_bonus_seconds: number
  /**
   * The most this session may add without breaking the weekly growth rule, or
   * null when there is no trailing week to compare against.
   */
  readonly weekly_distance_budget: number | null
  /** Why the load factor moved, in words. */
  readonly reasons: readonly string[]
}

/**
 * @param sessions the swimmer's sessions, newest first
 */
export function adapt(swimmer: Swimmer, sessions: readonly Session[], now: Timestamp): Adaptation {
  const caps = capsFor(swimmer)
  const rated = sessions.filter((session) => session.effort_rating !== undefined)
  const reasons: string[] = []

  let loadFactor = swimmer.load_factor

  const last = rated[0]
  const previous = rated[1]

  // Order matters: a hard session takes work away even if the one before it was
  // easy. Backing off is never postponed by a rule about adding.
  if (last !== undefined && (last.effort_rating === 'too_hard' || last.completed === false)) {
    loadFactor *= HARDER_STEP
    reasons.push(
      last.effort_rating === 'too_hard' ? 'Last swim was too hard' : 'Last swim was cut short',
    )
  } else if (
    last !== undefined &&
    previous !== undefined &&
    last.effort_rating === 'too_easy' &&
    previous.effort_rating === 'too_easy' &&
    last.completed !== false &&
    previous.completed !== false
  ) {
    loadFactor *= EASIER_STEP
    reasons.push('Two easy swims in a row')
  }

  const lastSwim = sessions[0]
  if (lastSwim !== undefined && now - lastSwim.date > LAYOFF_DAYS * DAY_MS) {
    loadFactor *= LAYOFF_STEP
    reasons.push('More than ten days since the last swim')
  }

  const relief = needsRelief(rated)
  if (relief) reasons.push('Easing send-offs after two hard swims')

  return {
    load_factor: clampLoadFactor(loadFactor, caps),
    send_off_bonus_seconds: relief ? RELIEF_SECONDS : 0,
    weekly_distance_budget: weeklyBudget(sessions, now),
    reasons,
  }
}

/**
 * Two "too hard" in a row buys a few seconds on every send-off, for the two
 * sessions after the pair. Looking back at the history rather than storing a
 * countdown keeps this a pure function of what actually happened.
 */
function needsRelief(rated: readonly Session[]): boolean {
  // `index` is how many sessions have been swum since the pair, so the pair itself
  // (0) plus the next two both qualify — hence `<=`.
  for (let index = 0; index <= RELIEF_SESSIONS; index += 1) {
    const first = rated[index]
    const second = rated[index + 1]
    if (first === undefined || second === undefined) return false

    if (first.effort_rating === 'too_hard' && second.effort_rating === 'too_hard') return true
  }

  return false
}

/**
 * How much distance this session may add before the week is more than ten percent
 * up on the one before it.
 *
 * Null when the trailing week holds nothing at all. A literal reading would make
 * the budget zero and the swimmer never swim again; a week off is what the layoff
 * rule is for, and that has already lowered the load factor by the time this runs.
 *
 * A budget of zero is a real answer, and means the week is full. The app's job is
 * to say so rather than to prescribe a hundred-yard workout.
 */
function weeklyBudget(sessions: readonly Session[], now: Timestamp): number | null {
  const within = (from: number, to: number): number =>
    sessions
      .filter((session) => session.date > now - to && session.date <= now - from)
      .reduce((total, session) => total + session.total_distance, 0)

  const priorWeek = within(WEEK_MS, 2 * WEEK_MS)
  if (priorWeek === 0) return null

  const thisWeek = within(0, WEEK_MS)
  return Math.max(priorWeek * WEEKLY_GROWTH - thisWeek, 0)
}
