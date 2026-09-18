import { describe, expect, it } from 'vitest'
import { parseExtent, parseInterval, parseLine, parseTemplate, type ParsedTemplate } from './parser'
import { demoTemplates } from '../fixtures/templates'
import type { ParsedLine, SetPart } from './types'

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

function part(line: ParsedLine): SetPart {
  const first = set(line).parts[0]
  if (!first) throw new Error(`set has no parts: ${line.raw}`)
  return first
}

function distanceOf(line: ParsedLine): number {
  const extent = part(line).extent
  if (extent.kind !== 'distance') throw new Error(`expected a distance: ${line.raw}`)
  return extent.value
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
    expect(distanceOf(line)).toBe(distance)
    expect(part(line).descriptor).toBe(descriptor)
    expect(line.raw).toBe(raw)
  })

  it('treats a bare distance as a single repetition', () => {
    expect(set(parseLine('400 choice easy')).reps).toBe(1)
  })

  it('accepts the multiplication sign as well as x', () => {
    expect(set(parseLine('4×50 free')).reps).toBe(4)
  })

  it('rounds distances to the nearest 25', () => {
    expect(distanceOf(parseLine('4x30 free'))).toBe(25)
    expect(distanceOf(parseLine('4x40 free'))).toBe(50)
    expect(distanceOf(parseLine('333 free'))).toBe(325)
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
    expect(part(line).descriptor).toBe('free')
  })

  it('keeps an unrecognisable interval in the descriptor rather than dropping it', () => {
    const line = set(parseLine('8x100 free @ whenever'))

    expect(line.interval).toBeUndefined()
    expect(part(line).descriptor).toBe('free @ whenever')
  })
})

describe('coaching notes', () => {
  it('splits the note off and leaves it out of the descriptor', () => {
    const line = set(parseLine('4x50 free @ base+25    # build 1-4'))

    expect(line.note).toBe('build 1-4')
    expect(part(line).descriptor).toBe('free')
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

describe('activity recognition', () => {
  it.each([
    ['300 free easy', 'free'],
    ['4x50 freestyle', 'free'],
    ['4x50 back @ base+10', 'back'],
    ['4x50 breaststroke', 'breast'],
    ['4x50 fly', 'fly'],
    ['4x100 IM @ base+30', 'im'],
    ['200 choice easy', 'choice'],
    ['4x50 kick with board @ base+40', 'kick'],
    ['4x50 pull with buoy', 'pull'],
    ['50 corkscrew', 'corkscrew'],
    ['4x25 underwater dolphin', 'underwater_dolphin'],
    ['2x1:00 tread water', 'tread_water'],
    ['1:00 back float', 'back_float'],
  ])('recognises the activity in %s', (raw, activity) => {
    expect(part(parseLine(raw)).activity).toBe(activity)
  })

  it('leaves the activity unset when nothing in the catalogue matches', () => {
    expect(part(parseLine('4x50 something nobody has named yet')).activity).toBeUndefined()
  })

  it('prefers the longest matching alias', () => {
    // "back float" must not be read as "back", and "underwater dolphin" must not
    // lose to a shorter alias.
    expect(part(parseLine('1:00 back float')).activity).toBe('back_float')
    expect(part(parseLine('4x25 underwater dolphin')).activity).toBe('underwater_dolphin')
  })

  it('finds an activity named after its modifiers, not only before them', () => {
    expect(part(parseLine('4x50 easy free')).activity).toBe('free')
  })
})

describe('extents', () => {
  it('reads a bare number as a distance', () => {
    expect(part(parseLine('100 free')).extent).toEqual({ kind: 'distance', value: 100 })
  })

  it('reads a clock value at the head as a duration', () => {
    expect(part(parseLine('1:00 tread water')).extent).toEqual({ kind: 'time', seconds: 60 })
    expect(part(parseLine('2x0:30 tread water')).extent).toEqual({ kind: 'time', seconds: 30 })
  })

  it('does not round durations to 25 the way it rounds distances', () => {
    expect(part(parseLine('0:40 sculling')).extent).toEqual({ kind: 'time', seconds: 40 })
  })

  it('keeps the head extent and the interval apart', () => {
    const line = set(parseLine('2x1:00 tread water @ 1:30'))

    expect(part(line).extent).toEqual({ kind: 'time', seconds: 60 })
    expect(line.interval).toEqual({ kind: 'literal', seconds: 90 })
  })

  it('rejects a zero duration', () => {
    expect(parseLine('0:00 tread water').kind).toBe('unparsed')
  })

  it.each(['abc', '', '1:75', 'base+10'])('rejects %s as an extent', (text) => {
    expect(parseExtent(text)).toBeNull()
  })

  it('does not take the front of a malformed clock value', () => {
    // 1:00:30 is not an extent. Accepting "1:00" and leaving ":30" in the
    // descriptor would silently halve a set nobody checked.
    expect(parseLine('1:00:30 free').kind).toBe('unparsed')
  })

  it('requires whitespace or end of line after the extent', () => {
    expect(parseLine('100m free').kind).toBe('unparsed')
  })
})

describe('an activity has to agree with the extent it is given', () => {
  it('does not attach a time-only activity to a distance', () => {
    // tread_water is measured in time. Attaching it to "100" would produce a
    // part the model says cannot exist.
    const line = parseLine('100 tread water')

    if (line.kind !== 'set') throw new Error('expected a set')
    expect(line.parts[0]?.activity).toBeUndefined()
    expect(line.parts[0]?.descriptor).toBe('tread water')
  })

  it('does not attach a distance-only activity to a duration', () => {
    const line = parseLine('1:00 fly')

    if (line.kind !== 'set') throw new Error('expected a set')
    expect(line.parts[0]?.activity).toBeUndefined()
  })

  it('accepts an either-extent activity both ways', () => {
    const distance = parseLine('100 sculling')
    const time = parseLine('1:00 sculling')

    if (distance.kind !== 'set' || time.kind !== 'set') throw new Error('expected sets')
    expect(distance.parts[0]?.activity).toBe('sculling')
    expect(time.parts[0]?.activity).toBe('sculling')
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

  it('does not let a metadata-shaped line inside a section override the header', () => {
    const parsed = parseTemplate(
      ['intensity: easy', '', 'main:', '  intensity: hard', '  4x50 free'].join('\n'),
    )

    // Header fields live in the block before the first section. Inside `main:`
    // that line is just text, and is kept as text.
    expect(parsed.intensity).toBe('easy')
    expect(parsed.sections[1]?.lines[0]?.kind).toBe('unparsed')
    expect(retainedLines(parsed)).toContain('  intensity: hard')
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

  it('never emits a distance that is not a positive multiple of 25', () => {
    for (const template of templates) {
      const sets = parseTemplate(template.raw_text)
        .sections.flatMap((section) => section.lines)
        .filter((line) => line.kind === 'set')

      for (const line of sets) {
        for (const setPart of line.parts) {
          if (setPart.extent.kind !== 'distance') continue
          expect(setPart.extent.value).toBeGreaterThan(0)
          expect(setPart.extent.value % 25).toBe(0)
        }
      }
    }
  })

  it('gives every set at least one part', () => {
    for (const template of templates) {
      const sets = parseTemplate(template.raw_text)
        .sections.flatMap((section) => section.lines)
        .filter((line) => line.kind === 'set')

      for (const line of sets) expect(line.parts.length).toBeGreaterThan(0)
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
