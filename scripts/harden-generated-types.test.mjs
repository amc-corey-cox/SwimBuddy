import { describe, expect, it } from 'vitest'
import { hardenGeneratedTypes } from './harden-generated-types.mjs'

/** Indented like the generator's output, so the property regex sees what it will see. */
function iface(...properties) {
  return ['export interface T {', ...properties.map((line) => `  ${line}`), '}'].join('\n')
}

describe('readonly', () => {
  it('marks every property readonly', () => {
    expect(hardenGeneratedTypes(iface('name: string'))).toBe(iface('readonly name: string'))
  })

  it('marks arrays readonly as well as the property holding them', () => {
    expect(hardenGeneratedTypes(iface('tags: string[]'))).toBe(
      iface('readonly tags: readonly string[]'),
    )
  })

  it('marks a tuple readonly, which is how a minimum_cardinality list arrives', () => {
    expect(hardenGeneratedTypes(iface('parts: [SetPart, ...SetPart[]]'))).toBe(
      iface('readonly parts: readonly [SetPart, ...SetPart[]]'),
    )
  })

  it('marks an array inside a union readonly', () => {
    expect(hardenGeneratedTypes(iface('either: string[] | number[]'))).toBe(
      iface('readonly either: readonly string[] | readonly number[]'),
    )
  })

  it('leaves a property that is already readonly alone', () => {
    expect(hardenGeneratedTypes(iface('readonly name: string'))).toBe(
      iface('readonly name: string'),
    )
  })

  it('does not touch lines that are not properties', () => {
    const source = 'export type Extent = Distance | Duration'
    expect(hardenGeneratedTypes(source)).toBe(source)
  })
})

describe('null', () => {
  it('drops a trailing null from an optional property', () => {
    expect(hardenGeneratedTypes(iface('note?: string | null'))).toBe(
      iface('readonly note?: string'),
    )
  })

  it('keeps the rest of a union when the null goes', () => {
    expect(hardenGeneratedTypes(iface('u?: A | B | null'))).toBe(iface('readonly u?: A | B'))
  })

  it('leaves a required property alone', () => {
    // A required nullable slot means the null is the model talking, not LinkML
    // padding an optional, so it is not this transform's to remove.
    expect(hardenGeneratedTypes(iface('raw: string | null'))).toBe(
      iface('readonly raw: string | null'),
    )
  })
})

describe('noise', () => {
  it('drops an index signature', () => {
    expect(hardenGeneratedTypes(iface('name: string', '[k: string]: unknown'))).toBe(
      iface('readonly name: string'),
    )
  })

  it('drops the generator chatter but keeps the prose above it', () => {
    const source = [
      '/**',
      ' * Real documentation.',
      ' *',
      " * This interface was referenced by `StoreSnapshot`'s JSON-Schema",
      ' * via the `definition` "Extent".',
      ' */',
      'export type Extent = Distance | Duration',
    ].join('\n')

    expect(hardenGeneratedTypes(source)).toBe(
      ['/**', ' * Real documentation.', ' */', 'export type Extent = Distance | Duration'].join(
        '\n',
      ),
    )
  })

  it('drops a comment left with nothing in it', () => {
    const source = [
      '/**',
      " * This interface was referenced by `StoreSnapshot`'s JSON-Schema",
      ' * via the `definition` "PoolUnit".',
      ' */',
      "export type PoolUnit = 'yards'",
    ].join('\n')

    expect(hardenGeneratedTypes(source)).toBe("export type PoolUnit = 'yards'")
  })
})
