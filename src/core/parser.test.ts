import { describe, expect, it } from 'vitest'
import { parseInterval, parseLine, parseTemplate, type ParsedTemplate } from './parser'
import { demoTemplates } from '../fixtures/templates'
import type { ParsedLine } from './types'

/** Every raw line the parser retained, in order. */
function retainedLines(parsed: ParsedTemplate): string[] {
  return parsed.sections.flatMap((section) => [
    ...(section.raw === null ? [] : [section.raw]),
    ...section.lines.map((line) => line.raw),
  ])
}

function set(line: ParsedLine) {
  if (line.kind !== 'set') throw new Error(`expected a set, got ${line.kind}: ${line.raw}`)
  return line
}

describe('set lines', () => {
  it.each([
    ['300 swim free easy', 1, 300, 'swim free easy'],
    ['4x50 free @ base+25', 4, 50, 'free'],
    ['8x25 free @ 0:45', 8, 25, 'free'],
    ['4x75 free drill/swim @ base+30', 4, 75, 'free drill/swim'],
    ['50 easy', 1, 50, 'easy'],
    ['200 choice easy', 1, 200, 'choice easy'],
    ['4x50 kick with board @ base+40', 4, 50, 'kick with board'],
    ['6x25 stroke of the day @ 1:00', 6, 25, 'stroke of the day'],
  ])('parses %s', (raw, reps, distance, descriptor) => {
    const line = set(parseLine(raw))

    expect(line.reps).toBe(reps)
    expect(line.distance).toBe(distance)
    expect(line.descriptor).toBe(descriptor)
    expect(line.raw).toBe(raw)
  })

  it('treats a bare distance as a single repetition', () => {
    expect(set(parseLine('400 choice easy')).reps).toBe(1)
  })

  it('accepts the multiplication sign as well as x', () => {
    expect(set(parseLine('4×50 free')).reps).toBe(4)
  })

  it('rounds distances to the nearest 25', () => {
    expect(set(parseLine('4x30 free')).distance).toBe(25)
    expect(set(parseLine('4x40 free')).distance).toBe(50)
    expect(set(parseLine('333 free')).distance).toBe(325)
  })
})

describe('distances that make no sense', () => {
  it.each(['4x0 free', '0 free', '4x00 free'])('leaves %s unparsed', (raw) => {
    expect(parseLine(raw).kind).toBe('unparsed')
  })
})

describe('rep slots', () => {
  it('parses a {reps:MIN-MAX} slot as a range', () => {
    expect(set(parseLine('{reps:4-8}x100 free @ base+15')).reps).toEqual({ min: 4, max: 8 })
  })

  it('accepts a slot whose bounds are equal', () => {
    expect(set(parseLine('{reps:3-3}x50 free')).reps).toEqual({ min: 3, max: 3 })
  })

  it.each([
    '{reps:8-4}x100 free', // inverted
    '{reps:0-4}x100 free', // zero minimum
    '{reps:4}x100 free', // missing bound
    '0x100 free', // zero repetitions
  ])('leaves %s unparsed rather than guessing', (raw) => {
    expect(parseLine(raw).kind).toBe('unparsed')
  })
})

describe('intervals', () => {
  it.each([
    ['base', { kind: 'base', offset_seconds: 0 }],
    ['base+15', { kind: 'base', offset_seconds: 15 }],
    ['base-5', { kind: 'base', offset_seconds: -5 }],
    ['base + 20', { kind: 'base', offset_seconds: 20 }],
    ['1:30', { kind: 'literal', seconds: 90 }],
    ['0:45', { kind: 'literal', seconds: 45 }],
    ['10:00', { kind: 'literal', seconds: 600 }],
  ])('parses %s', (text, expected) => {
    expect(parseInterval(text)).toEqual(expected)
  })

  it.each(['1:60', 'base*2', 'fast', '90', ''])('rejects %s', (text) => {
    expect(parseInterval(text)).toBeNull()
  })

  it('attaches the interval to the set and keeps it out of the descriptor', () => {
    const line = set(parseLine('8x100 free @ base+15'))

    expect(line.interval).toEqual({ kind: 'base', offset_seconds: 15 })
    expect(line.descriptor).toBe('free')
  })

  it('keeps an unrecognisable interval in the descriptor rather than dropping it', () => {
    const line = set(parseLine('8x100 free @ whenever'))

    expect(line.interval).toBeUndefined()
    expect(line.descriptor).toBe('free @ whenever')
  })
})

describe('coaching notes', () => {
  it('splits the note off and leaves it out of the descriptor', () => {
    const line = set(parseLine('4x50 free @ base+25    # build 1-4'))

    expect(line.note).toBe('build 1-4')
    expect(line.descriptor).toBe('free')
    expect(line.interval).toEqual({ kind: 'base', offset_seconds: 25 })
  })

  it('does not parse the note, however set-like it looks', () => {
    expect(set(parseLine('100 free # 4x50 back @ base')).note).toBe('4x50 back @ base')
  })

  it('ignores an empty note', () => {
    expect(set(parseLine('100 free #')).note).toBeUndefined()
  })

  it('treats a line that is only a note as unparsed, keeping it verbatim', () => {
    const line = parseLine('  # rest as long as you need')

    expect(line.kind).toBe('unparsed')
    expect(line.raw).toBe('  # rest as long as you need')
  })

  it('keeps a note on a line that is otherwise unparseable', () => {
    expect(parseLine('swim something # have fun').kind).toBe('unparsed')
  })
})

describe('stroke recognition', () => {
  it.each([
    ['300 free easy', 'free'],
    ['4x50 freestyle', 'free'],
    ['4x50 back @ base+10', 'back'],
    ['4x50 backstroke', 'back'],
    ['4x50 breast', 'breast'],
    ['4x50 fly', 'fly'],
    ['4x100 IM @ base+30', 'im'],
    ['200 choice easy', 'choice'],
  ])('recognises the stroke in %s', (raw, stroke) => {
    expect(set(parseLine(raw)).stroke).toBe(stroke)
  })

  it('leaves the stroke unset when none is named', () => {
    expect(set(parseLine('4x50 kick with board')).stroke).toBeUndefined()
  })

  it('does not mistake prose later in the line for a stroke', () => {
    // The grammar is `NxD stroke type`; "float on your back" is not a stroke
    // declaration, and reading it as one would send the resolver to the wrong
    // base pace.
    const line = set(parseLine('100 easy, float on your back and look at the ceiling'))
    expect(line.stroke).toBeUndefined()
  })
})

describe('lines that are not sets', () => {
  it.each([
    'Relay: 4x25 with a partner, loser buys popsicles',
    'swim until you feel like stopping',
    'descending 1-4',
    '-- rest as needed --',
  ])('keeps %s verbatim', (raw) => {
    const line = parseLine(raw)

    expect(line.kind).toBe('unparsed')
    expect(line.raw).toBe(raw)
  })

  it('does not treat a colon mid-line as a section header', () => {
    const parsed = parseTemplate('main:\n  Relay: 4x25 with a partner\n')

    expect(parsed.sections).toHaveLength(1)
    expect(parsed.sections[0]?.name).toBe('main')
    expect(parsed.sections[0]?.lines[0]?.kind).toBe('unparsed')
  })
})

describe('template structure', () => {
  const template = [
    'name: Aerobic base — free',
    'tags: endurance, free',
    'intensity: moderate',
    'level: 2-4',
    '',
    'warmup:',
    '  300 swim free easy',
    '  4x50 free @ base+25    # build 1-4',
    '',
    'main:',
    '  {reps:4-8}x100 free @ base+15',
    '  50 easy',
    '',
    'cooldown:',
    '  200 choice easy',
  ].join('\n')

  const parsed = parseTemplate(template)

  it('reads the header fields', () => {
    expect(parsed.name).toBe('Aerobic base — free')
    expect(parsed.tags).toEqual(['endurance', 'free'])
    expect(parsed.intensity).toBe('moderate')
    expect(parsed.level_range).toEqual({ min: 2, max: 4 })
  })

  it('groups lines under their section', () => {
    expect(parsed.sections.map((section) => section.name)).toEqual([
      '',
      'warmup',
      'main',
      'cooldown',
    ])
    expect(parsed.sections[1]?.lines).toHaveLength(2)
    expect(parsed.sections[2]?.lines).toHaveLength(2)
  })

  it('keeps header lines as metadata rather than discarding them', () => {
    expect(parsed.sections[0]?.lines.every((line) => line.kind === 'meta')).toBe(true)
  })

  it('tolerates a missing header entirely', () => {
    const bare = parseTemplate('main:\n  4x50 free @ base\n')

    expect(bare.name).toBeUndefined()
    expect(bare.tags).toEqual([])
    expect(bare.intensity).toBeUndefined()
    expect(bare.level_range).toBeUndefined()
  })

  it('accepts a level given as a single number', () => {
    expect(parseTemplate('level: 3\n').level_range).toEqual({ min: 3, max: 3 })
  })

  it('ignores an inverted level range', () => {
    expect(parseTemplate('level: 4-2\n').level_range).toBeUndefined()
  })

  it('ignores an intensity or level it does not understand', () => {
    const odd = parseTemplate('intensity: spicy\nlevel: hard\n')

    expect(odd.intensity).toBeUndefined()
    expect(odd.level_range).toBeUndefined()
    // ...but the lines themselves survive.
    expect(retainedLines(odd)).toEqual(['intensity: spicy', 'level: hard'])
  })
})

/**
 * The spec's testing note: table-driven over every template in the library,
 * asserting no line is lost. The fixture templates are that library until the
 * real one lands.
 */
describe('the template library round-trips without losing content', () => {
  const templates = demoTemplates()

  it.each(templates.map((template) => [template.name, template.raw_text] as const))(
    'keeps every line of %s',
    (_name, rawText) => {
      const parsed = parseTemplate(rawText)
      const expected = rawText.split('\n').filter((line) => line.trim() !== '')

      expect(retainedLines(parsed)).toEqual(expected)
    },
  )

  it.each(templates.map((template) => [template.name, template.raw_text] as const))(
    'finds at least one real set in %s',
    (_name, rawText) => {
      const sets = parseTemplate(rawText)
        .sections.flatMap((section) => section.lines)
        .filter((line) => line.kind === 'set')

      expect(sets.length).toBeGreaterThan(0)
    },
  )

  it('agrees with the metadata already recorded on each fixture', () => {
    for (const template of templates) {
      const parsed = parseTemplate(template.raw_text)

      expect(parsed.name).toBe(template.name)
      expect(parsed.tags).toEqual(template.tags)
      expect(parsed.intensity).toBe(template.intensity)
      expect(parsed.level_range).toEqual(template.level_range)
    }
  })

  it('never emits a set with a non-positive or non-25 distance', () => {
    for (const template of templates) {
      const sets = parseTemplate(template.raw_text)
        .sections.flatMap((section) => section.lines)
        .filter((line) => line.kind === 'set')

      for (const line of sets) {
        expect(line.distance).toBeGreaterThan(0)
        expect(line.distance % 25).toBe(0)
      }
    }
  })
})

describe('whitespace and blank lines', () => {
  it('drops blank lines without dropping content', () => {
    const parsed = parseTemplate('\n\nmain:\n\n  4x50 free\n\n')
    expect(retainedLines(parsed)).toEqual(['main:', '  4x50 free'])
  })

  it('returns an empty template for empty input', () => {
    const parsed = parseTemplate('')

    expect(parsed.sections).toEqual([])
    expect(parsed.tags).toEqual([])
  })
})
