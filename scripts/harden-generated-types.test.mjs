import { describe, expect, it } from 'vitest'
import { hardenGeneratedTypes } from './harden-generated-types.mjs'

const SHAPES = {
  unions: new Map([['Extent', ['Distance', 'Duration']]]),
  nonEmptyLists: new Map([['T', new Set(['parts'])]]),
}

const NONE = { unions: new Map(), nonEmptyLists: new Map() }

/** Indented like gen-typescript's output, so the property regex sees what it will see. */
function iface(...properties) {
  return ['export interface T {', ...properties.map((line) => `    ${line}`), '}'].join('\n')
}

function harden(source, shapes = NONE) {
  return hardenGeneratedTypes(source, shapes)
}

describe('enums', () => {
  it('becomes a string-literal union, because string enums are nominal', () => {
    // `stroke_group: 'free'` is an error against a TS string enum, and every
    // fixture in this repo writes the string.
    const source = [
      'export enum PoolUnit {',
      '    yards = "yards",',
      '    meters = "meters",',
      '};',
    ].join('\n')

    expect(harden(source)).toBe("export type PoolUnit = 'yards' | 'meters'")
  })

  it('keeps a value whose member name differs from it', () => {
    const source = ['export enum P {', '    number_400_200 = "400/200",', '};'].join('\n')

    expect(harden(source)).toBe("export type P = '400/200'")
  })

  it('leaves an enum it cannot read alone rather than dropping values', () => {
    const source = ['export enum Weird {', '    computed = someCall(),', '};'].join('\n')

    expect(harden(source)).toBe(source)
  })
})

describe('union parents', () => {
  it('turns an empty abstract parent into a union alias', () => {
    expect(harden('export interface Extent {\n}', SHAPES)).toBe(
      'export type Extent = Distance | Duration',
    )
  })

  it('stops the children extending what is no longer an interface', () => {
    const source = [
      'export interface Extent {',
      '}',
      '',
      'export interface Distance extends Extent {',
      '}',
    ].join('\n')

    expect(harden(source, SHAPES)).toContain('export interface Distance {')
  })

  it('leaves a parent that is not a union extending normally', () => {
    const source = 'export interface Swimmer extends RecordMeta {\n}'

    expect(harden(source, SHAPES)).toBe(source)
  })

  it('puts the union name back where the generator spelled out its members', () => {
    expect(harden(iface('extent: Distance | Duration,'), SHAPES)).toBe(
      iface('readonly extent: Extent,'),
    )
  })

  it('names a union inside an array too', () => {
    expect(harden(iface('all: (Distance | Duration)[],'), SHAPES)).toBe(
      iface('readonly all: readonly Extent[],'),
    )
  })
})

describe('readonly', () => {
  it('marks every property readonly', () => {
    expect(harden(iface('name: string,'))).toBe(iface('readonly name: string,'))
  })

  it('marks arrays readonly as well as the property holding them', () => {
    expect(harden(iface('tags: string[],'))).toBe(iface('readonly tags: readonly string[],'))
  })

  it('leaves a property that is already readonly alone', () => {
    expect(harden(iface('readonly name: string,'))).toBe(iface('readonly name: string,'))
  })

  it('does not touch lines that are not properties', () => {
    expect(harden('export type X = string')).toBe('export type X = string')
  })

  it('keeps an optional marker', () => {
    expect(harden(iface('note?: string,'))).toBe(iface('readonly note?: string,'))
  })
})

describe('doc comments', () => {
  it('gives a continuation line its star back', () => {
    // A multi-paragraph description is interpolated into a single `*` line, so
    // everything after the first blank line falls outside the comment's rail.
    const source = [
      '/**',
      ' * First paragraph.',
      'Second paragraph.',
      ' */',
      'export type X = string',
    ].join('\n')

    expect(harden(source)).toBe(
      ['/**', ' * First paragraph.', ' * Second paragraph.', ' */', 'export type X = string'].join(
        '\n',
      ),
    )
  })

  it('leaves a blank continuation line as a bare star', () => {
    const source = ['/**', ' * First.', '', 'Second.', ' */'].join('\n')

    expect(harden(source)).toBe(['/**', ' * First.', ' *', ' * Second.', ' */'].join('\n'))
  })

  it('does not touch code outside a comment', () => {
    const source = [
      '/**',
      ' * Doc.',
      ' */',
      'export type X = string',
      'export type Y = number',
    ].join('\n')

    expect(harden(source)).toBe(source)
  })

  it('leaves a single-line comment alone', () => {
    const source = ['/** Short. */', 'export type X = string'].join('\n')

    expect(harden(source)).toBe(source)
  })
})

describe('non-empty lists', () => {
  it('becomes a tuple, so the first element is a value rather than undefined', () => {
    expect(harden(iface('parts: SetPart[],'), SHAPES)).toBe(
      iface('readonly parts: readonly [SetPart, ...SetPart[]],'),
    )
  })

  it('leaves a list with no stated minimum as an array', () => {
    expect(harden(iface('tags: string[],'), SHAPES)).toBe(
      iface('readonly tags: readonly string[],'),
    )
  })

  it('only applies to the interface that declares the slot', () => {
    const other = ['export interface Other {', '    parts: SetPart[],', '}'].join('\n')

    expect(harden(other, SHAPES)).toContain('readonly parts: readonly SetPart[],')
  })
})
