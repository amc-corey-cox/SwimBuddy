import { describe, expect, it } from 'vitest'
import { ACTIVITIES, activityById, recogniseActivity } from './activities'

describe('the shipped catalogue', () => {
  it('gives every entry a unique id', () => {
    const ids = ACTIVITIES.map((activity) => activity.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every entry at least one alias a template author might write', () => {
    for (const activity of ACTIVITIES) {
      expect(activity.aliases.length).toBeGreaterThan(0)
      expect(activity.aliases.every((alias) => alias.trim() !== '')).toBe(true)
    }
  })

  it('only gives a stroke group to paced activities', () => {
    // An unpaced activity has no base pace to look up, so a stroke group on one
    // would be a promise the resolver cannot keep.
    for (const activity of ACTIVITIES) {
      if (activity.stroke_group !== undefined) expect(activity.paced).toBe(true)
    }
  })

  it('never lets two entries claim the same alias', () => {
    // Normalised, because the matcher normalises: " Fins " and "fins" are one
    // alias wearing two spellings, not two aliases.
    const aliases = ACTIVITIES.flatMap((activity) =>
      activity.aliases.map((alias) => alias.trim().toLowerCase()),
    )
    expect(new Set(aliases).size).toBe(aliases.length)
  })
})

describe('activityById', () => {
  it('finds a known activity', () => {
    expect(activityById('tread_water')?.name).toBe('Treading water')
  })

  it('returns undefined for an id that is not in the catalogue', () => {
    expect(activityById('synchronised_napping')).toBeUndefined()
  })
})

describe('recogniseActivity', () => {
  it('matches on a word boundary rather than a substring', () => {
    // "freestyle" contains "free", but "carefree" should not name an activity.
    expect(recogniseActivity('carefree paddling')).toBeUndefined()
  })

  it('is case insensitive', () => {
    expect(recogniseActivity('IM')?.id).toBe('im')
    expect(recogniseActivity('Tread Water')?.id).toBe('tread_water')
  })

  it('returns undefined for an empty descriptor', () => {
    expect(recogniseActivity('')).toBeUndefined()
  })
})
