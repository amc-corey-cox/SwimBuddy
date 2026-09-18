import { byAliasLength, matchTerm, matchTerms } from './terms'
import type { AppliedPattern, EffortBand, Equipment, Pattern, RepRange, Structure } from './types'

/**
 * The four modifier catalogues: equipment, effort, pattern and structure.
 *
 * These were named in docs/spec.md long before they were modelled, and lived in
 * the part's descriptor text meanwhile. They are data on the same terms as the
 * activity catalogue: examples chosen to prove the shape stretches, not an
 * exhaustive library, and adding one is a row rather than a release.
 *
 * Recognising a modifier never consumes the words. The descriptor is kept
 * verbatim either way, so a term the catalogue does not know is still shown to
 * the swimmer exactly as the author wrote it.
 */

export const EQUIPMENT: readonly Equipment[] = [
  {
    id: 'board',
    name: 'Kickboard',
    aliases: ['kickboard', 'kick board', 'board'],
    implies_mode: 'kick',
  },
  { id: 'buoy', name: 'Pull buoy', aliases: ['pull buoy', 'buoy'], implies_mode: 'pull' },
  { id: 'fins', name: 'Fins', aliases: ['fins', 'flippers'] },
  { id: 'paddles', name: 'Paddles', aliases: ['hand paddles', 'paddles'] },
  { id: 'snorkel', name: 'Snorkel', aliases: ['snorkel'] },
  { id: 'band', name: 'Ankle band', aliases: ['ankle band', 'band'] },
]

/**
 * Effort bands, ordered. `rank` exists so selection rules can ask which of two
 * sets is harder without parsing English; it is not a pace and never becomes one.
 */
export const EFFORTS: readonly EffortBand[] = [
  { id: 'recovery', name: 'Recovery', aliases: ['recovery', 'recover'], rank: 1 },
  { id: 'easy', name: 'Easy', aliases: ['easy'], rank: 2 },
  { id: 'steady', name: 'Steady', aliases: ['steady', 'aerobic', 'moderate'], rank: 3 },
  { id: 'strong', name: 'Strong', aliases: ['strong'], rank: 4 },
  { id: 'threshold', name: 'Threshold', aliases: ['threshold', 'tempo'], rank: 5 },
  { id: 'hard', name: 'Hard', aliases: ['hard', 'fast'], rank: 6 },
  { id: 'race_pace', name: 'Race pace', aliases: ['race pace', 'race'], rank: 7 },
  { id: 'sprint', name: 'Sprint', aliases: ['sprint', 'all out', 'all-out', 'max'], rank: 8 },
]

/**
 * Patterns, each declaring the scopes it can carry with its default first.
 *
 * `build` carries both, and which one is meant is decidable from the text: a
 * trailing repetition range means the shape is across the set, and its absence
 * means the shape is inside each repetition. `descend` only ever counts
 * repetitions; a negative split only ever happens within one swim.
 */
export const PATTERNS: readonly Pattern[] = [
  { id: 'build', name: 'Build', aliases: ['build'], scopes: ['within_rep', 'across_set'] },
  { id: 'descend', name: 'Descend', aliases: ['descend'], scopes: ['across_set'] },
  { id: 'ascend', name: 'Ascend', aliases: ['ascend'], scopes: ['across_set'] },
  { id: 'alternate', name: 'Alternate', aliases: ['alternate'], scopes: ['across_set'] },
  { id: 'ladder', name: 'Ladder', aliases: ['ladder'], scopes: ['across_set'] },
  { id: 'pyramid', name: 'Pyramid', aliases: ['pyramid'], scopes: ['across_set'] },
  {
    id: 'negative_split',
    name: 'Negative split',
    aliases: ['negative split', 'neg split'],
    scopes: ['within_rep'],
  },
  { id: 'broken', name: 'Broken', aliases: ['broken'], scopes: ['within_rep'] },
]

export const STRUCTURES: readonly Structure[] = [
  { id: 'relay', name: 'Relay', aliases: ['relay'], min_swimmers: 2 },
  { id: 'partner', name: 'Partner', aliases: ['partner'], min_swimmers: 2 },
  { id: 'pace_line', name: 'Pace line', aliases: ['pace line', 'paceline'], min_swimmers: 2 },
]

const EQUIPMENT_ALIASES = byAliasLength(EQUIPMENT)
const EFFORT_ALIASES = byAliasLength(EFFORTS)
const PATTERN_ALIASES = byAliasLength(PATTERNS)
const STRUCTURE_ALIASES = byAliasLength(STRUCTURES)

/** `1-4` in `descend 1-4`, read from the text immediately after the pattern word. */
const TRAILING_RANGE = /^\s+(\d+)\s*-\s*(\d+)/

/** Every piece of kit the descriptor names, in the order it names them. */
export function recogniseEquipment(descriptor: string): readonly string[] {
  return matchTerms(descriptor, EQUIPMENT_ALIASES).map((match) => match.term.id)
}

export function recogniseEffort(descriptor: string): EffortBand | undefined {
  return matchTerm(descriptor, EFFORT_ALIASES)?.term
}

export function recogniseStructure(descriptor: string): Structure | undefined {
  return matchTerm(descriptor, STRUCTURE_ALIASES)?.term
}

/**
 * The pattern a descriptor names, resolved to the scope it means here.
 *
 * A repetition range only makes the pattern an across-set one when the
 * catalogue says it can be: `negative split 1-4` is not a set-wide instruction
 * however it is written, so the range is left in the descriptor rather than
 * recorded as a span the scope cannot carry.
 */
export function recognisePattern(descriptor: string): AppliedPattern | undefined {
  const match = matchTerm(descriptor, PATTERN_ALIASES)
  if (!match) return undefined

  const range = parseRepRange(descriptor.slice(match.index + match.length))
  if (range && match.term.scopes.includes('across_set')) {
    return { id: match.term.id, scope: 'across_set', range }
  }

  return { id: match.term.id, scope: match.term.scopes[0] }
}

/** Null rather than a guess when the range runs backwards or starts at zero. */
function parseRepRange(after: string): RepRange | null {
  const range = TRAILING_RANGE.exec(after)
  if (range === null) return null

  // Both groups are required runs of digits, so a match always carries them.
  const from = Number(range[1])
  const to = Number(range[2])
  return from > 0 && to > from ? { from, to } : null
}
