import { describe, expect, it } from 'vitest'
import { nonEmptyListsOf, unionsOf } from './schema-shapes.mjs'

const LINKML = {
  classes: {
    Extent: { abstract: true },
    Distance: { is_a: 'Extent' },
    Duration: { is_a: 'Extent' },
    // Shared structure, not a union: the parent declares fields of its own.
    RecordMeta: { abstract: true, attributes: { id: {} } },
    Swimmer: { is_a: 'RecordMeta' },
    Pattern: {
      attributes: {
        scopes: { multivalued: true, minimum_cardinality: 1 },
        tags: { multivalued: true },
        name: {},
      },
    },
  },
}

describe('unionsOf', () => {
  it('finds an abstract parent with children and no fields of its own', () => {
    expect([...unionsOf(LINKML)]).toEqual([['Extent', ['Distance', 'Duration']]])
  })

  it('does not treat shared record structure as a union', () => {
    // RecordMeta has children too, but Swimmer is a record that *has* an id, not
    // one of two things a slot might hold. It keeps its interface and its extends.
    expect(unionsOf(LINKML).has('RecordMeta')).toBe(false)
  })

  it('returns nothing for a schema with no inheritance', () => {
    expect([...unionsOf({ classes: { A: {} } })]).toEqual([])
  })

  it('ignores a child whose parent is not abstract', () => {
    expect([...unionsOf({ classes: { A: {}, B: { is_a: 'A' } } })]).toEqual([])
  })

  it('tolerates a schema with no classes at all', () => {
    expect([...unionsOf({})]).toEqual([])
  })
})

describe('nonEmptyListsOf', () => {
  it('finds a multivalued slot the schema says may not be empty', () => {
    expect(nonEmptyListsOf(LINKML).get('Pattern')).toEqual(new Set(['scopes']))
  })

  it('ignores a multivalued slot with no minimum', () => {
    expect(nonEmptyListsOf(LINKML).get('Pattern')?.has('tags')).toBe(false)
  })

  it('ignores a minimum on a slot that is not a list', () => {
    const single = { classes: { A: { attributes: { x: { minimum_cardinality: 1 } } } } }

    expect(nonEmptyListsOf(single).has('A')).toBe(false)
  })

  it('records nothing for a class with no such slots', () => {
    expect(nonEmptyListsOf(LINKML).has('Swimmer')).toBe(false)
  })
})
