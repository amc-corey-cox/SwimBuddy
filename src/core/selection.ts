import { resolveTemplate } from './resolver'
import { capsFor } from './safety'
import type { Session, Swimmer, Template, Timestamp } from './types'

/**
 * Which workout to offer a swimmer today.
 *
 * The rules are the spec's, in the spec's order of importance: never two hard
 * sessions back to back, prefer tags that have not come up lately, respect the
 * length that was asked for. Pure, so "why this one?" is answerable by a test
 * rather than by rerunning the app.
 */

/** Seconds of rest per 100 assumed when estimating how long a workout takes. */
const REST_PER_100_SECONDS = 15

/** Past this many days out of the water, the next session should be a shorter one. */
const LAYOFF_DAYS = 10

const DAY_MS = 24 * 60 * 60 * 1000

/** How much a layoff shortens the session someone asked for. */
const LAYOFF_SCALE = 0.6

/**
 * How much worse it is to run long than to run short.
 *
 * Pool time is booked. A session that finishes early is a minor disappointment; one
 * that overruns means getting out mid-set, so overshooting the requested length
 * costs double. It is also what makes "pick a shorter template" after a layoff bite
 * — scaling the target alone barely moves the choice when the options are far apart.
 */
const OVERRUN_PENALTY = 2

export interface SelectionContext {
  readonly swimmer: Swimmer
  readonly templates: readonly Template[]
  /** The swimmer's sessions, newest first. */
  readonly recentSessions: readonly Session[]
  readonly requestedMinutes: number
  readonly now: Timestamp
  /**
   * The most this session may add under the weekly growth rule, when there is a
   * trailing week to measure against.
   *
   * Checked here rather than left to the resolver, because the resolver will not
   * trim a workout below a single set — so a budget smaller than the smallest
   * template is a question only selection can answer, and the answer is to offer
   * nothing. "The week is full" is a better thing to be told than a hundred-yard
   * workout that pretends otherwise.
   */
  readonly weeklyDistanceBudget?: number
}

export interface Selection {
  readonly template: Template
  /** Why this one, in words a person can read on the pre-swim screen. */
  readonly reasons: readonly string[]
  readonly estimated_minutes: number
}

/**
 * Roughly how long a workout takes: the distance at base pace, plus a fixed rest
 * allowance per 100. Deliberately crude — it picks between templates rather than
 * telling anybody when they will be home.
 */
export function estimateMinutes(distance: number, swimmer: Swimmer): number {
  const perHundred = swimmer.base_pace_by_stroke.free + REST_PER_100_SECONDS
  return Math.round(((distance / 100) * perHundred) / 60)
}

export function selectTemplate(context: SelectionContext): Selection | undefined {
  const { swimmer, templates, recentSessions, now } = context
  const caps = capsFor(swimmer)

  const lastSession = recentSessions[0]
  const lastWasHard = lastSession
    ? templates.find((each) => each.id === lastSession.template_id)?.intensity === 'hard'
    : false

  const daysSinceLastSwim = lastSession === undefined ? Infinity : (now - lastSession.date) / DAY_MS
  const returning = daysSinceLastSwim > LAYOFF_DAYS
  const targetMinutes = returning
    ? context.requestedMinutes * LAYOFF_SCALE
    : context.requestedMinutes

  const recentTags = new Set(
    recentSessions
      .slice(0, 3)
      .flatMap((session) => templates.find((each) => each.id === session.template_id)?.tags ?? []),
  )

  const wantsFun = needsFun(swimmer, recentSessions)

  const candidates = templates
    .filter((template) => !template.deleted)
    .map((template) => {
      const workout = resolveTemplate(template, swimmer)
      return { template, workout, minutes: estimateMinutes(workout.total_distance, swimmer) }
    })
    // A template the resolver could not bring under a limit that applies is one the
    // resolver asked selection not to offer. This is that promise being kept, for
    // the swimmer's own cap and for the week's remaining budget alike.
    .filter(({ workout }) =>
      [caps.max_session_distance, context.weeklyDistanceBudget]
        .filter((limit): limit is number => limit !== undefined && limit !== null)
        .every((limit) => workout.total_distance <= limit),
    )
    // Two hard sessions back to back is the one rule with no score attached: it is
    // a refusal, not a preference.
    .filter(({ template }) => !(lastWasHard && template.intensity === 'hard'))

  const best = candidates
    .map((candidate) => ({
      ...candidate,
      score: score(candidate.template, candidate.minutes, targetMinutes, recentTags, wantsFun),
    }))
    .sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id))[0]

  if (best === undefined) return undefined

  return {
    template: best.template,
    estimated_minutes: best.minutes,
    reasons: reasonsFor(best.template, best.minutes, recentTags, {
      lastWasHard,
      returning,
      wantsFun,
    }),
  }
}

/**
 * Two thumbs-down in a row from a youth swimmer biases selection toward the
 * drill and fun tags. The spec's rule, and the reason the son has a fun rating
 * at all.
 */
function needsFun(swimmer: Swimmer, recentSessions: readonly Session[]): boolean {
  if (!swimmer.is_youth) return false

  const rated = recentSessions.filter((session) => session.fun_rating !== undefined)
  return rated.length >= 2 && rated.slice(0, 2).every((session) => session.fun_rating === 'down')
}

const FUN_TAGS = new Set(['fun', 'drill'])

function score(
  template: Template,
  minutes: number,
  targetMinutes: number,
  recentTags: ReadonlySet<string>,
  wantsFun: boolean,
): number {
  // Closeness to the requested length, counting an overrun twice as heavily as
  // finishing early. Decays rather than clamping, so two templates that are both
  // far off the target still rank against each other instead of tying at zero.
  const off = Math.abs(minutes - targetMinutes) / Math.max(targetMinutes, 1)
  const fit = 1 / (1 + off * (minutes > targetMinutes ? OVERRUN_PENALTY : 1))

  const fresh = template.tags.filter((tag) => !recentTags.has(tag)).length
  const freshness = template.tags.length === 0 ? 0 : fresh / template.tags.length

  const fun = wantsFun && template.tags.some((tag) => FUN_TAGS.has(tag)) ? 1 : 0

  // Length is what the swimmer actually asked for, so it weighs most. Freshness
  // keeps the week varied. The fun bias only matters when it has been earned.
  return fit * 3 + freshness * 2 + fun * 2
}

function reasonsFor(
  template: Template,
  minutes: number,
  recentTags: ReadonlySet<string>,
  flags: { lastWasHard: boolean; returning: boolean; wantsFun: boolean },
): readonly string[] {
  const reasons: string[] = [`About ${String(minutes)} minutes`]

  const fresh = template.tags.filter((tag) => !recentTags.has(tag))
  if (fresh.length > 0) reasons.push(`New this week: ${fresh.join(', ')}`)
  if (flags.lastWasHard) reasons.push('Last swim was hard, so this one is not')
  if (flags.returning) reasons.push('Been a while — starting shorter')
  if (flags.wantsFun) reasons.push('Picked for variety')

  return reasons
}
