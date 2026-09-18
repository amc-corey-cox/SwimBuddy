import { describe, expect, it } from 'vitest'
import { hoistUnions, stripRefSiblings, unionsOf } from './hoist-schema-unions.mjs'

const LINKML = {
  classes: {
    Extent: { abstract: true },
    Distance: { is_a: 'Extent' },
    Duration: { is_a: 'Extent' },
    // Shared structure, not a union: the parent declares fields of its own.
    RecordMeta: { abstract: true, attributes: { id: {} } },
    Swimmer: { is_a: 'RecordMeta' },
  },
}

function schema() {
  return {
    $defs: {
      Extent: { type: 'object', title: 'Extent', description: 'A distance or a duration.' },
      Distance: { type: 'object' },
      Duration: { type: 'object' },
      RecordMeta: { type: 'object' },
      Swimmer: {
        type: 'object',
        properties: {
          extent: { anyOf: [{ $ref: '#/$defs/Distance' }, { $ref: '#/$defs/Duration' }] },
        },
      },
    },
  }
}

describe('unionsOf', () => {
  it('finds an abstract parent with children and no fields of its own', () => {
    expect([...unionsOf(LINKML)]).toEqual([['Extent', ['Distance', 'Duration']]])
  })

  it('does not treat shared record structure as a union', () => {
    // RecordMeta has children too, but Swimmer is a record that *has* an id, not
    // one of two things a slot might hold.
    expect(unionsOf(LINKML).has('RecordMeta')).toBe(false)
  })

  it('returns nothing for a schema with no inheritance', () => {
    expect([...unionsOf({ classes: { A: {} } })]).toEqual([])
  })

  it('tolerates a schema with no classes at all', () => {
    expect([...unionsOf({})]).toEqual([])
  })
})

describe('hoistUnions', () => {
  it('points a matching anyOf at the named parent', () => {
    const hoisted = hoistUnions(schema(), unionsOf(LINKML))

    expect(hoisted.$defs.Swimmer.properties.extent).toEqual({ $ref: '#/$defs/Extent' })
  })

  it('fills the parent in with its children, keeping its description', () => {
    const hoisted = hoistUnions(schema(), unionsOf(LINKML))

    expect(hoisted.$defs.Extent).toEqual({
      title: 'Extent',
      description: 'A distance or a duration.',
      anyOf: [{ $ref: '#/$defs/Distance' }, { $ref: '#/$defs/Duration' }],
    })
  })

  it('does not leave the parent referring to itself', () => {
    // The parent gains an anyOf of exactly the children it matches on. Filling it
    // in before rewriting use sites turns it into a $ref to itself, and the
    // generator then fails to resolve the model at all.
    const hoisted = hoistUnions(schema(), unionsOf(LINKML))

    expect(hoisted.$defs.Extent.$ref).toBeUndefined()
  })

  it('carries a nullable union across, since optionality carries the null', () => {
    const input = schema()
    input.$defs.Swimmer.properties.extent.anyOf.push({ type: 'null' })

    expect(hoistUnions(input, unionsOf(LINKML)).$defs.Swimmer.properties.extent).toEqual({
      $ref: '#/$defs/Extent',
    })
  })

  it('leaves a union it does not recognise alone', () => {
    const input = schema()
    input.$defs.Swimmer.properties.extent.anyOf = [
      { type: 'integer' },
      { $ref: '#/$defs/Duration' },
    ]

    expect(hoistUnions(input, unionsOf(LINKML)).$defs.Swimmer.properties.extent.anyOf).toHaveLength(
      2,
    )
  })

  it('leaves a union whose members do not all belong to one parent alone', () => {
    const input = schema()
    input.$defs.Swimmer.properties.extent.anyOf = [
      { $ref: '#/$defs/Distance' },
      { $ref: '#/$defs/Swimmer' },
    ]

    expect(
      hoistUnions(input, unionsOf(LINKML)).$defs.Swimmer.properties.extent.$ref,
    ).toBeUndefined()
  })

  it('skips a parent the JSON Schema has no definition for', () => {
    const input = schema()
    delete input.$defs.Extent

    expect(() => hoistUnions(input, unionsOf(LINKML))).not.toThrow()
  })
})

describe('stripRefSiblings', () => {
  it('removes a description sitting beside a ref', () => {
    // Left in place, the generator reads every distinct sibling set as a distinct
    // type, and one Interval comes back as Interval1 and Interval2.
    const stripped = stripRefSiblings({
      properties: { pace: { $ref: '#/$defs/Interval', description: 'How fast to swim it.' } },
    })

    expect(stripped.properties.pace).toEqual({ $ref: '#/$defs/Interval' })
  })

  it('leaves a node without a ref untouched', () => {
    const stripped = stripRefSiblings({
      properties: { name: { type: 'string', description: 'A name.' } },
    })

    expect(stripped.properties.name).toEqual({ type: 'string', description: 'A name.' })
  })
})
