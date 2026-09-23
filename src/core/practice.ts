import { resolveTemplate, setDistance, type ResolveOptions } from './resolver'
import { capsFor } from './safety'
import type { ResolvedSection, ResolvedSet, ResolvedWorkout, Swimmer, Template } from './types'

/**
 * One arrangement, resolved for everybody, with nobody left standing on the wall.
 *
 * Swimmers in the same practice have different base paces, so the same set takes
 * them different lengths of time. Left alone that means the fastest swimmer
 * finishes 8x100 while the slowest is on their sixth, and either the practice
 * waits or it stops being a practice.
 *
 * The fix is to give the faster swimmer more repetitions rather than more rest:
 * the set is a block of time, and the number of repetitions that fills it is a
 * per-swimmer number for the same reason the send-off is. Nobody's workout is
 * shortened — the slowest swimmer sets the length and everybody else is brought
 * up to it.
 */

/**
 * The most a set may grow, as a multiple of what the template asked for.
 *
 * A wide enough pace spread would otherwise turn somebody's 6x100 into a 14x100,
 * which is a different set and not what the author wrote. Past this the faster
 * swimmer simply gets the rest.
 */
const MAX_GROWTH = 2

export interface PracticeParticipantInput {
  readonly swimmer: Swimmer
  readonly options?: ResolveOptions
}

export interface PracticeParticipant {
  readonly swimmer: Swimmer
  readonly workout: ResolvedWorkout
  /** How many sets gained repetitions so this swimmer was not left waiting. */
  readonly extended_sets: number
}

export function resolvePractice(
  template: Template,
  participants: readonly PracticeParticipantInput[],
): readonly PracticeParticipant[] {
  const resolved = participants.map((entry) => {
    const options = entry.options ?? {}
    const workout = resolveTemplate(template, entry.swimmer, options)
    return {
      swimmer: entry.swimmer,
      options,
      sections: cloneSections(workout.sections),
      capped: workout.capped,
      extended: 0,
    }
  })

  // One swimmer cannot wait for anybody, so there is nothing to balance.
  const [first, ...rest] = resolved
  if (first !== undefined && rest.length > 0) {
    for (const column of columns(first, resolved)) {
      balance(column)
    }
  }

  return resolved.map((entry) => ({
    swimmer: entry.swimmer,
    extended_sets: entry.extended,
    workout: {
      swimmer_id: entry.swimmer.id,
      template_id: template.id,
      sections: entry.sections,
      total_distance: totalDistance(entry.sections, entry.swimmer),
      capped: entry.capped,
    } satisfies ResolvedWorkout,
  }))
}

interface Working {
  readonly swimmer: Swimmer
  readonly options: ResolveOptions
  readonly sections: MutableSection[]
  readonly capped: boolean
  extended: number
}

interface MutableSection {
  readonly name: string
  readonly sets: ResolvedSet[]
}

/**
 * One swimmer's place in one set of the practice.
 *
 * Carries the array the set lives in rather than a pair of indices, so balancing
 * writes the new repetition count straight back. Nothing has to be looked up a
 * second time, which is what makes "this swimmer has no set here" impossible to
 * express rather than something to keep checking for.
 */
interface Slot {
  readonly entry: Working
  readonly sets: ResolvedSet[]
  readonly index: number
  readonly set: ResolvedSet
  readonly perRep: number
}

/**
 * The sets every swimmer is doing together, one entry per position.
 *
 * The youth distance cap can leave somebody with a shorter workout than the rest.
 * A position they never reach is one they are already done with rather than one
 * to balance, so it is left out entirely.
 */
function columns(first: Working, everyone: readonly Working[]): readonly (readonly Slot[])[] {
  const result: (readonly Slot[])[] = []

  for (const [sectionIndex, section] of first.sections.entries()) {
    for (const index of section.sets.keys()) {
      const slots: Slot[] = []

      for (const entry of everyone) {
        const sets = entry.sections[sectionIndex]?.sets
        const set = sets?.[index]
        if (sets === undefined || set === undefined) break
        slots.push({ entry, sets, index, set, perRep: perRepSeconds(set, entry.swimmer) })
      }

      if (slots.length === everyone.length) result.push(slots)
    }
  }

  return result
}

/** Brings everybody in one column up to the time the slowest swimmer takes. */
function balance(column: readonly Slot[]): void {
  const target = Math.max(...column.map((slot) => slot.set.reps * slot.perRep))

  for (const slot of column) {
    const wanted = Math.floor(target / slot.perRep)
    const allowed = Math.min(wanted, slot.set.reps * MAX_GROWTH)
    if (allowed <= slot.set.reps) continue

    const reps = withinDistanceLimit(slot, allowed)
    if (reps <= slot.set.reps) continue

    slot.sets[slot.index] = { ...slot.set, reps }
    slot.entry.extended += 1
  }
}

/**
 * How long one repetition takes.
 *
 * A send-off is exactly this by definition. Without one the set takes as long as
 * it takes to swim, which is the honest estimate for a warmup nobody is holding
 * an interval on. Always positive: a set has at least one part, and a part is
 * either a distance of at least one length or a duration of at least a second.
 */
function perRepSeconds(set: ResolvedSet, swimmer: Swimmer): number {
  if (set.send_off_seconds !== undefined) return set.send_off_seconds

  return set.parts.reduce((total, part) => {
    if (part.extent.kind === 'time') return total + part.extent.seconds
    return total + (part.extent.value / 100) * swimmer.base_pace_by_stroke.free
  }, 0)
}

/**
 * The largest rep count that keeps the swimmer inside their distance limit.
 *
 * The safety caps are not negotiable and adding repetitions is exactly the way to
 * breach one, so a youth swimmer who would go over simply gets the rest instead.
 */
function withinDistanceLimit(slot: Slot, wanted: number): number {
  const caps = capsFor(slot.entry.swimmer)
  const limits = [caps.max_session_distance, slot.entry.options.maxDistance].filter(
    (limit): limit is number => limit !== undefined && limit !== null,
  )
  if (limits.length === 0) return wanted

  const limit = Math.min(...limits)
  const swimmer = slot.entry.swimmer
  const perRep = setDistance({ ...slot.set, reps: 1 }, swimmer)
  const without = totalDistance(slot.entry.sections, swimmer) - setDistance(slot.set, swimmer)
  const affordable = Math.floor((limit - without) / perRep)

  return Math.max(slot.set.reps, Math.min(wanted, affordable))
}

function cloneSections(sections: readonly ResolvedSection[]): MutableSection[] {
  return sections.map((section) => ({ name: section.name, sets: [...section.sets] }))
}

function totalDistance(sections: readonly MutableSection[], swimmer: Swimmer): number {
  return sections.reduce(
    (sum, section) =>
      sum + section.sets.reduce((inner, set) => inner + setDistance(set, swimmer), 0),
    0,
  )
}
