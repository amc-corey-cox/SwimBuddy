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

/** One template a swimmer could be given today, with how well it suits them. */
interface Candidate {
  readonly template: Template
  readonly minutes: number
  readonly score: number
}

interface Evaluation {
  readonly candidates: readonly Candidate[]
  readonly recentTags: ReadonlySet<string>
  readonly flags: { lastWasHard: boolean; returning: boolean; wantsFun: boolean }
}

/**
 * Every template this swimmer could be offered, scored.
 *
 * Split out of `selectTemplate` so a practice can ask the same question of
 * several swimmers and compare the answers. Choosing for a group is not a
 * different rule set — it is these rules, run per swimmer, reconciled after.
 */
function evaluate(context: SelectionContext): Evaluation {
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

  return {
    candidates: candidates.map(({ template, minutes }) => ({
      template,
      minutes,
      score: score(template, minutes, targetMinutes, recentTags, wantsFun),
    })),
    recentTags,
    flags: { lastWasHard, returning, wantsFun },
  }
}

export function selectTemplate(context: SelectionContext): Selection | undefined {
  const { candidates, recentTags, flags } = evaluate(context)

  const best = [...candidates].sort(
    (a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id),
  )[0]

  if (best === undefined) return undefined

  return {
    template: best.template,
    estimated_minutes: best.minutes,
    reasons: reasonsFor(best.template, best.minutes, recentTags, flags),
  }
}

/** One swimmer's share of a practice: who they are and what they have been doing. */
export interface PracticeSwimmer {
  readonly swimmer: Swimmer
  /** That swimmer's sessions, newest first. */
  readonly recentSessions: readonly Session[]
  readonly weeklyDistanceBudget?: number
}

export interface PracticeSelectionContext {
  readonly swimmers: readonly PracticeSwimmer[]
  readonly templates: readonly Template[]
  readonly requestedMinutes: number
  readonly now: Timestamp
}

export interface PracticeSelection {
  readonly template: Template
  readonly reasons: readonly string[]
  /** How long the practice takes, which is how long its slowest swimmer takes. */
  readonly estimated_minutes: number
}

/**
 * One arrangement for everybody, rather than one each.
 *
 * A practice is a whiteboard and a whiteboard has one workout on it. So a
 * template has to clear every swimmer's eligibility — the youth distance cap,
 * the week's remaining budget, no two hard sessions running — and is then
 * scored by whoever it suits *worst*. One person who swam hard yesterday is
 * enough to steer the whole practice off a hard set, which is the intended
 * behaviour and not a rounding error: the alternative is handing somebody a
 * session the rules already said they should not have.
 *
 * Resolution stays per swimmer, so the shape is shared and the numbers are not.
 */
export function selectForPractice(
  context: PracticeSelectionContext,
): PracticeSelection | undefined {
  const evaluations = context.swimmers.map((entry) => ({
    swimmer: entry.swimmer,
    evaluation: evaluate({
      swimmer: entry.swimmer,
      templates: context.templates,
      recentSessions: entry.recentSessions,
      requestedMinutes: context.requestedMinutes,
      now: context.now,
      ...(entry.weeklyDistanceBudget === undefined
        ? {}
        : { weeklyDistanceBudget: entry.weeklyDistanceBudget }),
    }),
  }))

  const first = evaluations[0]
  if (first === undefined) return undefined

  const shared = first.evaluation.candidates
    .map((candidate) => {
      // Every swimmer has to have this template among their own candidates. One
      // missing it means somebody would be handed something their rules refused.
      const scored: { entry: (typeof evaluations)[number]; candidate: Candidate }[] = []
      for (const entry of evaluations) {
        const found = entry.evaluation.candidates.find(
          (each) => each.template.id === candidate.template.id,
        )
        if (found === undefined) return undefined
        scored.push({ entry, candidate: found })
      }

      // `evaluations` is non-empty — checked above — so `scored` is too, which is
      // why this reduces rather than sorting and indexing. The swimmer an
      // arrangement suits worst is the one who decides whether it is offered.
      const worst = scored.reduce((a, b) => (b.candidate.score < a.candidate.score ? b : a))

      return {
        template: candidate.template,
        worst,
        minutes: Math.max(...scored.map((each) => each.candidate.minutes)),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

  const best = [...shared].sort(
    (a, b) =>
      b.worst.candidate.score - a.worst.candidate.score ||
      a.template.id.localeCompare(b.template.id),
  )[0]

  if (best === undefined) return undefined

  const binding = best.worst.entry
  const solo = context.swimmers.length === 1

  return {
    template: best.template,
    estimated_minutes: best.minutes,
    reasons: [
      solo
        ? 'One swimmer in this practice.'
        : `Chosen to suit all ${String(context.swimmers.length)} swimmers.`,
      ...reasonsFor(
        best.template,
        best.worst.candidate.minutes,
        binding.evaluation.recentTags,
        binding.evaluation.flags,
      ).map((reason) => (solo ? reason : `${binding.swimmer.name}: ${reason}`)),
    ],
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
