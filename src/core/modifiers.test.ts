import { describe, expect, it } from 'vitest'
import {
  EFFORTS,
  EQUIPMENT,
  PATTERNS,
  STRUCTURES,
  recogniseEffort,
  recogniseEquipment,
  recognisePattern,
  recogniseStructure,
} from './modifiers'
import { ACTIVITIES } from './activities'
import type { Term } from './types'

/** The matcher normalises aliases, so assertions about them have to as well. */
const normalise = (alias: string): string => alias.trim().toLowerCase()

const CATALOGUES: readonly (readonly [string, readonly Term[]])[] = [
  ['equipment', EQUIPMENT],
  ['efforts', EFFORTS],
  ['patterns', PATTERNS],
  ['structures', STRUCTURES],
]

describe('the shipped catalogues', () => {
  it.each(CATALOGUES)('gives every %s entry a unique id', (_name, terms) => {
    const ids = terms.map((term) => term.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(CATALOGUES)('never lets two %s entries claim the same alias', (_name, terms) => {
    const aliases = terms.flatMap((term) => term.aliases.map(normalise))
    expect(new Set(aliases).size).toBe(aliases.length)
  })

  it.each(CATALOGUES)('gives every %s entry a usable alias', (_name, terms) => {
    for (const term of terms) {
      expect(term.aliases.length).toBeGreaterThan(0)
      expect(term.aliases.every((alias) => alias.trim() !== '')).toBe(true)
    }
  })

  it('never lets a modifier claim a word an activity already means', () => {
    // A word can only mean one thing per descriptor. "kick" is an activity, so
    // no piece of equipment may also answer to it, or "50 kick" would parse two
    // ways depending on which catalogue happened to be consulted first.
    const activityAliases = new Set(
      ACTIVITIES.flatMap((activity) => activity.aliases.map(normalise)),
    )
    const modifierAliases = CATALOGUES.flatMap(([, terms]) =>
      terms.flatMap((term) => term.aliases.map(normalise)),
    )

    expect(modifierAliases.filter((alias) => activityAliases.has(alias))).toEqual([])
  })

  it('ranks effort bands from easiest to hardest, with no ties', () => {
    const ranks = EFFORTS.map((effort) => effort.rank)

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('gives every pattern at least one scope', () => {
    for (const pattern of PATTERNS) {
      expect(pattern.scopes.length).toBeGreaterThan(0)
    }
  })

  it('needs more than one swimmer for every structure', () => {
    // A structure is about sharing repetitions out. One swimmer sharing with
    // themselves is not a structure, it is just a set.
    for (const structure of STRUCTURES) {
      expect(structure.min_swimmers).toBeGreaterThan(1)
    }
  })
})

describe('recogniseEquipment', () => {
  it('reads a single piece of kit', () => {
    expect(recogniseEquipment('kick with board')).toEqual(['board'])
  })

  it('reads several, because fins and a snorkel is one ordinary request', () => {
    expect(recogniseEquipment('free with fins and a snorkel')).toEqual(['fins', 'snorkel'])
  })

  it('reads a pull buoy once rather than as a buoy as well', () => {
    expect(recogniseEquipment('pull with a pull buoy')).toEqual(['buoy'])
  })

  it('returns nothing when the swimmer is asked to carry nothing', () => {
    expect(recogniseEquipment('free easy')).toEqual([])
  })
})

describe('recogniseEffort', () => {
  it.each([
    ['free easy', 'easy'],
    ['25 all out', 'sprint'],
    ['free at race pace', 'race_pace'],
    ['free hard', 'hard'],
    ['choice recovery', 'recovery'],
  ])('reads the effort band in %s', (descriptor, expected) => {
    expect(recogniseEffort(descriptor)?.id).toBe(expected)
  })

  it('is not a pace, and so has no seconds in it', () => {
    // The whole reason effort is a separate slot: "easy" is a band, not a time.
    expect(recogniseEffort('free easy')).not.toHaveProperty('seconds')
  })

  it('returns undefined when the descriptor prescribes no effort', () => {
    expect(recogniseEffort('free')).toBeUndefined()
  })
})

describe('recogniseStructure', () => {
  it('reads a relay', () => {
    expect(recogniseStructure('25 relay')?.id).toBe('relay')
  })

  it('reads a partner set', () => {
    expect(recogniseStructure('free with a partner')?.id).toBe('partner')
  })

  it('returns undefined for a set one swimmer swims alone', () => {
    expect(recogniseStructure('free easy')).toBeUndefined()
  })
})

describe('recognisePattern', () => {
  it('reads a bare build as a shape inside each repetition', () => {
    expect(recognisePattern('free build')).toEqual({ id: 'build', scope: 'within_rep' })
  })

  it('reads a build over a range of repetitions as a shape across the set', () => {
    // The two readings of "build" are different instructions: one says how to
    // swim each 50, the other says how the fourth 50 compares to the first.
    expect(recognisePattern('free build 1-4')).toEqual({
      id: 'build',
      scope: 'across_set',
      range: { from: 1, to: 4 },
    })
  })

  it('reads descend as across the set even with no range written', () => {
    expect(recognisePattern('free descend')).toEqual({ id: 'descend', scope: 'across_set' })
  })

  it('keeps a range off a pattern whose scope cannot carry one', () => {
    // A negative split happens inside one swim. "negative split 1-4" is not a
    // set-wide instruction however it is written, so the numbers stay in the
    // descriptor rather than being recorded as a span that means nothing.
    expect(recognisePattern('free negative split 1-4')).toEqual({
      id: 'negative_split',
      scope: 'within_rep',
    })
  })

  it.each(['free build 0-4', 'free build 4-1', 'free build 3-3'])(
    'ignores the nonsensical range in %s',
    (descriptor) => {
      expect(recognisePattern(descriptor)).toEqual({ id: 'build', scope: 'within_rep' })
    },
  )

  it('tolerates spaces around the dash', () => {
    expect(recognisePattern('free descend 1 - 4')?.range).toEqual({ from: 1, to: 4 })
  })

  it('only reads a range that immediately follows the pattern word', () => {
    expect(recognisePattern('free build, then 1-4 something')?.range).toBeUndefined()
  })

  it('returns undefined when the descriptor has no shape to it', () => {
    expect(recognisePattern('free easy')).toBeUndefined()
  })
})
