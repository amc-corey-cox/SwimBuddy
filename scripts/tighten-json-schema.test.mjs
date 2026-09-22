import { describe, expect, it } from 'vitest'
import { applyMultiples, dropNullBranches } from './tighten-json-schema.mjs'

describe('dropNullBranches', () => {
  it('turns an optional primitive back into its own type', () => {
    const schema = { properties: { raw: { type: ['string', 'null'] } } }

    expect(dropNullBranches(schema).properties.raw.type).toBe('string')
  })

  it('leaves a type that was never nullable alone', () => {
    const schema = { properties: { id: { type: 'string' } } }

    expect(dropNullBranches(schema).properties.id.type).toBe('string')
  })

  it('keeps a genuine multi-type once the null is gone', () => {
    const schema = { properties: { x: { type: ['string', 'integer', 'null'] } } }

    expect(dropNullBranches(schema).properties.x.type).toEqual(['string', 'integer'])
  })

  it('drops the null branch from a nullable union', () => {
    const schema = {
      properties: { pace: { anyOf: [{ $ref: '#/$defs/A' }, { type: 'null' }] } },
    }

    expect(dropNullBranches(schema).properties.pace.anyOf).toEqual([{ $ref: '#/$defs/A' }])
  })

  it('leaves a null branch that carries anything else', () => {
    // Only a bare `{type: "null"}` is LinkML padding an optional; anything richer
    // is the model saying something, and not this transform's to remove.
    const schema = {
      properties: { x: { anyOf: [{ $ref: '#/$defs/A' }, { type: 'null', title: 'Nothing' }] } },
    }

    expect(dropNullBranches(schema).properties.x.anyOf).toHaveLength(2)
  })

  it('reaches into nested definitions', () => {
    const schema = { $defs: { A: { properties: { b: { type: ['integer', 'null'] } } } } }

    expect(dropNullBranches(schema).$defs.A.properties.b.type).toBe('integer')
  })
})

describe('applyMultiples', () => {
  it('constrains a distance to whole pool lengths', () => {
    const schema = { $defs: { Distance: { properties: { value: { type: 'integer' } } } } }

    expect(applyMultiples(schema).$defs.Distance.properties.value.multipleOf).toBe(25)
  })

  it('throws rather than silently skipping a property that moved', () => {
    // A renamed definition would otherwise drop the constraint and nothing would
    // fail — the schema would just quietly stop enforcing the spec's rule.
    expect(() => applyMultiples({ $defs: {} })).toThrow(/not in the schema/)
  })
})
