import { describe, expect, it } from 'vitest'
import { byAliasLength, matchTerm, matchTerms, termById } from './terms'
import type { Term } from './types'

const KIT: readonly Term[] = [
  { id: 'buoy', name: 'Buoy', aliases: ['buoy'] },
  { id: 'pull_buoy', name: 'Pull buoy', aliases: ['pull buoy'] },
  { id: 'fins', name: 'Fins', aliases: ['fins', 'flippers'] },
]

const INDEX = byAliasLength(KIT)

describe('byAliasLength', () => {
  it('puts the longest alias first, whatever order the catalogue is in', () => {
    // Ties keep catalogue order, which is why "buoy" precedes "fins" here.
    expect(INDEX.map(([alias]) => alias)).toEqual(['pull buoy', 'flippers', 'buoy', 'fins'])
  })
})

describe('termById', () => {
  it('finds a term by its id', () => {
    expect(termById('fins', KIT)?.name).toBe('Fins')
  })

  it('returns undefined for an id the catalogue does not have', () => {
    expect(termById('jetpack', KIT)).toBeUndefined()
  })
})

describe('matchTerm', () => {
  it('prefers the longest alias, so a longer term is never read as a shorter one', () => {
    expect(matchTerm('50 with a pull buoy', INDEX)?.term.id).toBe('pull_buoy')
  })

  it('reports where the alias matched, so a caller can read what follows it', () => {
    const match = matchTerm('swim with fins', INDEX)

    expect(match?.index).toBe(10)
    expect(match?.length).toBe(4)
  })

  it('matches on a word boundary rather than a substring', () => {
    expect(matchTerm('finsomething', INDEX)).toBeUndefined()
  })

  it('is case insensitive', () => {
    expect(matchTerm('Flippers', INDEX)?.term.id).toBe('fins')
  })

  it('is case insensitive about the alias too, not just the descriptor', () => {
    // The catalogues become records a swimmer can add, so an alias typed as
    // "IM" has to match "4x100 im". Lowercasing only one side would leave that
    // row silently unmatchable.
    const shouty = byAliasLength([{ id: 'im', name: 'IM', aliases: ['IM'] }])

    expect(matchTerm('4x100 im', shouty)?.term.id).toBe('im')
    expect(matchTerm('4x100 IM', shouty)?.term.id).toBe('im')
  })

  it('tolerates an alias with stray whitespace around it', () => {
    const padded = byAliasLength([{ id: 'fins', name: 'Fins', aliases: [' fins '] }])

    expect(matchTerm('free with fins', padded)?.term.id).toBe('fins')
  })

  it('returns undefined when the descriptor names nothing', () => {
    expect(matchTerm('', INDEX)).toBeUndefined()
  })
})

describe('matchTerms', () => {
  it('returns every distinct term, in the order the descriptor names them', () => {
    expect(matchTerms('fins and a buoy', INDEX).map((match) => match.term.id)).toEqual([
      'fins',
      'buoy',
    ])
  })

  it('never returns the same term twice', () => {
    expect(matchTerms('fins, then more fins', INDEX)).toHaveLength(1)
  })

  it('does not let a shorter alias claim a span a longer one already took', () => {
    // "pull buoy" is one piece of kit. Without the overlap check the "buoy"
    // inside it would be counted a second time, and the swimmer would be told
    // to carry two things to the wall.
    expect(matchTerms('50 pull buoy', INDEX).map((match) => match.term.id)).toEqual(['pull_buoy'])
  })

  it('still matches a shorter alias where it stands on its own', () => {
    const found = matchTerms('50 pull buoy, then 50 with a buoy', INDEX)

    expect(found.map((match) => match.term.id)).toEqual(['pull_buoy', 'buoy'])
  })

  it('returns nothing when the descriptor names nothing', () => {
    expect(matchTerms('easy swimming', INDEX)).toEqual([])
  })
})
