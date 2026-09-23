import { activityById } from './activities'
import { basePaceFor } from './pace'
import { parseTemplate } from './parser'
import { capsFor, clampLoadFactor, type SafetyCaps } from './safety'
import { roundToNearest25 } from './units'
import type {
  Extent,
  Interval,
  RepCount,
  ResolvedSection,
  ResolvedSet,
  ResolvedWorkout,
  SetLine,
  SetPart,
  StrokeGroup,
  Swimmer,
  Template,
} from './types'

/**
 * Template + swimmer -> a workout with every number decided.
 *
 * The parser says what the author wrote; this says what this swimmer swims today.
 * Pure, like everything in core: given the same template, swimmer and load factor
 * it returns the same workout, which is what makes the safety caps testable.
 */

/** Load factor bounds are universal, so the same load resolves the same everywhere. */
const LOAD_FLOOR = 0.6
const LOAD_CEILING = 1.4

/**
 * Seconds per 100 added to base pace to get an easy swim.
 *
 * Used only to convert a timed set into the distance it is worth, which the spec
 * calls approximate on purpose. Being wrong by a few seconds here moves a weekly
 * volume number slightly; it never changes what anybody is asked to swim.
 */
const EASY_PACE_MARGIN_SECONDS = 20

export interface ResolveOptions {
  /**
   * Overrides the swimmer's stored load factor. The adaptation rules compute a
   * new one before a session; this is how it reaches the resolver without a write.
   */
  readonly loadFactor?: number
  /**
   * Added to every resolved send-off. The adaptation rules grant this after two
   * hard sessions running, so it is relief rather than a preference.
   */
  readonly sendOffBonusSeconds?: number
  /**
   * A distance ceiling on top of the swimmer's own cap, from the weekly growth
   * rule. Trimmed to the same way and reported the same way.
   */
  readonly maxDistance?: number
}

export function resolveTemplate(
  template: Template,
  swimmer: Swimmer,
  options: ResolveOptions = {},
): ResolvedWorkout {
  const caps = capsFor(swimmer)
  const loadFactor = clampLoadFactor(options.loadFactor ?? swimmer.load_factor, caps)

  const bonus = options.sendOffBonusSeconds ?? 0

  const sections = parseTemplate(template.raw_text).sections.map((section) => ({
    name: section.name,
    sets: section.lines
      .filter((line): line is SetLine => line.kind === 'set')
      .map((line) => resolveSet(line, swimmer, loadFactor, caps, bonus)),
  }))

  // The weekly growth rule and the youth cap are the same kind of limit, so the
  // tighter of the two is simply the limit.
  const limits = [caps.max_session_distance, options.maxDistance].filter(
    (limit): limit is number => limit !== undefined && limit !== null,
  )
  const limit = limits.length > 0 ? Math.min(...limits) : null

  const withSets = sections.filter((section) => section.sets.length > 0)
  const capped = applyDistanceCap(withSets, swimmer, limit)

  return {
    swimmer_id: swimmer.id,
    template_id: template.id,
    sections: capped.sections,
    total_distance: capped.total_distance,
    capped: capped.capped,
  }
}

function resolveSet(
  line: SetLine,
  swimmer: Swimmer,
  loadFactor: number,
  caps: SafetyCaps,
  sendOffBonusSeconds: number,
): ResolvedSet {
  const reps = resolveReps(line.reps, loadFactor)
  const authored = line.interval
    ? resolveInterval(line.interval, line.parts, swimmer, caps)
    : undefined
  const sendOff = authored === undefined ? undefined : authored + sendOffBonusSeconds
  const pace = line.pace ? resolveInterval(line.pace, line.parts, swimmer, undefined) : undefined

  return {
    reps,
    parts: line.parts,
    raw: line.raw,
    ...(sendOff !== undefined ? { send_off_seconds: sendOff } : {}),
    ...(pace !== undefined ? { pace_seconds: pace } : {}),
    ...(line.pattern ? { pattern: line.pattern } : {}),
    ...(line.structure !== undefined ? { structure: line.structure } : {}),
    ...(line.note !== undefined ? { note: line.note } : {}),
  }
}

/**
 * A `{reps:MIN-MAX}` slot resolved from the load factor.
 *
 * The load factor's position within its universal bounds is the position within
 * the template's range: 1.0 lands in the middle, 0.6 at the bottom, 1.4 at the
 * top. The bounds stay universal rather than per-swimmer so that the same load
 * factor means the same thing for everyone, and the youth ceiling limits how far
 * up the range a young swimmer can get rather than rescaling the whole range.
 */
export function resolveReps(reps: RepCount, loadFactor: number): number {
  if (typeof reps === 'number') return reps

  const span = LOAD_CEILING - LOAD_FLOOR
  const position = Math.min(Math.max((loadFactor - LOAD_FLOOR) / span, 0), 1)
  return Math.round(reps.min + position * (reps.max - reps.min))
}

/**
 * A send-off or pace in seconds.
 *
 * `base` intervals scale the swimmer's base pace for the relevant stroke to the
 * extent being swum. An unpaced activity has no base pace to scale, so a relative
 * interval on one cannot be resolved and is dropped rather than guessed at — the
 * set still reads correctly, it just leaves when the swimmer is ready.
 *
 * `caps` applies the minimum-rest floor. Pass undefined for a pace target, which
 * is how fast to swim rather than when to leave and has no rest to protect.
 */
function resolveInterval(
  interval: Interval,
  parts: readonly SetPart[],
  swimmer: Swimmer,
  caps: SafetyCaps | undefined,
): number | undefined {
  if (interval.kind === 'literal') {
    return caps ? Math.max(interval.seconds, floorFor(parts, swimmer, caps)) : interval.seconds
  }

  const swimTime = basePaceSeconds(parts, swimmer)
  if (swimTime === undefined) return undefined

  const authored = swimTime + interval.offset_seconds
  const resolved = caps ? Math.max(authored, swimTime + caps.min_rest_seconds) : authored
  return Math.max(Math.round(resolved), 1)
}

/** The send-off below which a set would leave less rest than is safe. */
function floorFor(parts: readonly SetPart[], swimmer: Swimmer, caps: SafetyCaps): number {
  const swimTime = basePaceSeconds(parts, swimmer)
  return swimTime === undefined ? 1 : Math.round(swimTime + caps.min_rest_seconds)
}

/**
 * How long this set's distance takes at the swimmer's base pace, or undefined
 * when nothing in it is paced.
 *
 * Base pace is seconds per 100, so a 50 takes half of it and a 200 twice.
 */
function basePaceSeconds(parts: readonly SetPart[], swimmer: Swimmer): number | undefined {
  let total = 0
  let paced = false

  for (const part of parts) {
    if (part.extent.kind !== 'distance') continue

    const stroke = strokeFor(part)
    if (stroke === undefined) continue

    paced = true
    total += (basePaceFor(swimmer.base_pace_by_stroke, stroke) * part.extent.value) / 100
  }

  return paced ? total : undefined
}

/**
 * The stroke group a part is paced against.
 *
 * An activity with its own stroke group uses it. One that takes the stroke it is
 * paired with — kick, pull, drill — has no group of its own here, because the
 * parser emits a single part and the pairing lives in the descriptor; free is the
 * honest default and matches what the template library actually contains.
 */
function strokeFor(part: SetPart): StrokeGroup | undefined {
  if (part.activity === undefined) return undefined

  const activity = activityById(part.activity)
  if (activity === undefined || !activity.paced) return undefined

  return activity.stroke_group ?? 'free'
}

/** The distance a set is worth, counting a timed part as the easy swim it stands in for. */
export function setDistance(set: ResolvedSet, swimmer: Swimmer): number {
  const perRep = set.parts.reduce((total, part) => total + extentDistance(part.extent, swimmer), 0)
  return perRep * set.reps
}

function extentDistance(extent: Extent, swimmer: Swimmer): number {
  if (extent.kind === 'distance') return extent.value

  const easyPace = swimmer.base_pace_by_stroke.free + EASY_PACE_MARGIN_SECONDS
  return roundToNearest25((extent.seconds / easyPace) * 100)
}

interface CappedSections {
  readonly sections: readonly ResolvedSection[]
  readonly total_distance: number
  readonly capped: boolean
}

/**
 * Brings a workout under the swimmer's session distance cap.
 *
 * Repetitions come off the longest sets first, because that is what a coach would
 * shorten and it keeps the shape of the session. A set is never reduced below one
 * repetition; when trimming cannot get there, whole sets are dropped from the end,
 * since losing the end of a workout beats handing a child one they should not swim.
 */
function applyDistanceCap(
  sections: readonly ResolvedSection[],
  swimmer: Swimmer,
  limit: number | null,
): CappedSections {
  const total = (current: readonly ResolvedSection[]): number =>
    current.reduce(
      (sum, section) =>
        sum + section.sets.reduce((sectionSum, set) => sectionSum + setDistance(set, swimmer), 0),
      0,
    )

  if (limit === null || total(sections) <= limit) {
    return { sections, total_distance: total(sections), capped: false }
  }

  const working: ResolvedSection[] = sections.map((section) => ({
    ...section,
    sets: [...section.sets],
  }))

  while (total(working) > limit && trimOnce(working, swimmer)) {
    // trimOnce did the work; the guard re-measures.
  }

  while (total(working) > limit && dropLast(working)) {
    // Same, for whole sets.
  }

  return { sections: working, total_distance: total(working), capped: true }
}

/** Takes one repetition off the longest set that has more than one. Returns false when none does. */
function trimOnce(sections: ResolvedSection[], swimmer: Swimmer): boolean {
  let best:
    { section: ResolvedSection; index: number; set: ResolvedSet; distance: number } | undefined

  for (const section of sections) {
    section.sets.forEach((set, index) => {
      if (set.reps <= 1) return
      const distance = setDistance(set, swimmer)
      if (best === undefined || distance > best.distance) best = { section, index, set, distance }
    })
  }

  if (best === undefined) return false

  const sets = best.section.sets as ResolvedSet[]
  sets[best.index] = { ...best.set, reps: best.set.reps - 1 }
  return true
}

/** Removes the last set in the workout. Returns false when only one set is left. */
function dropLast(sections: ResolvedSection[]): boolean {
  const populated = sections.filter((section) => section.sets.length > 0)
  const remaining = populated.reduce((count, section) => count + section.sets.length, 0)
  const last = populated.at(-1)

  // One set is the floor: a workout trimmed to nothing is not a safer workout.
  // A single set that busts the cap on its own therefore survives it, and the
  // workout comes back `capped` while still over. That is a template nobody should
  // have offered this swimmer, and template selection is where it gets caught.
  if (last === undefined || remaining <= 1) return false

  const sets = last.sets as ResolvedSet[]
  sets.pop()
  return true
}
