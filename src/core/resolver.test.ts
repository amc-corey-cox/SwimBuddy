import { describe, expect, it } from 'vitest'
import { resolveReps, resolveTemplate } from './resolver'
import { ADULT_CAPS, YOUTH_CAPS } from './safety'
import { demoSwimmers, demoTemplates } from '../fixtures'
import type { Swimmer, Template } from './types'

const META = { created_at: 0, updated_at: 0, deleted: false }

function swimmer(overrides: Partial<Swimmer> = {}): Swimmer {
  return {
    ...META,
    id: 'swimmer-1',
    name: 'Test',
    base_pace_by_stroke: { free: 120 },
    load_factor: 1,
    is_youth: false,
    ...overrides,
  }
}

function template(body: string): Template {
  return {
    ...META,
    id: 'template-1',
    name: 'Test template',
    tags: [],
    intensity: 'moderate',
    level_range: { min: 1, max: 5 },
    raw_text: body,
  }
}

/** Every resolved set in the workout, in order. */
function sets(workout: ReturnType<typeof resolveTemplate>) {
  return workout.sections.flatMap((section) => section.sets)
}

function only(body: string, who: Swimmer = swimmer()) {
  const first = sets(resolveTemplate(template(`main:\n  ${body}`), who))[0]
  if (first === undefined) throw new Error(`no set resolved from: ${body}`)
  return first
}

describe('repetition slots', () => {
  it('puts a default load factor in the middle of the range', () => {
    expect(resolveReps({ min: 4, max: 8 }, 1)).toBe(6)
  })

  it('puts the floor at the bottom and the ceiling at the top', () => {
    expect(resolveReps({ min: 4, max: 8 }, 0.6)).toBe(4)
    expect(resolveReps({ min: 4, max: 8 }, 1.4)).toBe(8)
  })

  it('leaves a fixed count alone', () => {
    expect(resolveReps(5, 1.4)).toBe(5)
  })

  it('stays inside the range for a load factor beyond the bounds', () => {
    expect(resolveReps({ min: 4, max: 8 }, 99)).toBe(8)
    expect(resolveReps({ min: 4, max: 8 }, -99)).toBe(4)
  })

  it('reads the same load factor the same way for a youth swimmer', () => {
    // The bounds are universal on purpose. Rescaling them per swimmer would mean
    // a youth at 1.0 got *more* reps than an adult at 1.0, which is backwards.
    const youth = only('{reps:4-8}x100 free', swimmer({ is_youth: true }))
    const adult = only('{reps:4-8}x100 free')

    expect(youth.reps).toBe(adult.reps)
  })

  it('caps how far up the range a youth swimmer can be taken', () => {
    const youth = only('{reps:4-8}x100 free', swimmer({ is_youth: true, load_factor: 1.4 }))
    const adult = only('{reps:4-8}x100 free', swimmer({ load_factor: 1.4 }))

    expect(youth.reps).toBeLessThan(adult.reps)
    expect(youth.reps).toBe(resolveReps({ min: 4, max: 8 }, YOUTH_CAPS.max_load_factor))
  })
})

describe('send-offs', () => {
  it('scales base pace to the distance being swum', () => {
    // 120s per 100, so a 50 is 60s, plus the 15s the set asks for.
    expect(only('4x50 free @ base+15').send_off_seconds).toBe(75)
  })

  it('scales up for a longer repetition', () => {
    expect(only('4x200 free @ base+20').send_off_seconds).toBe(260)
  })

  it('uses the stroke offset when a stroke has not been tested', () => {
    // Breaststroke falls back to free + 15, so a 100 is 135 plus the offset asked for.
    expect(only('4x100 breast @ base+10').send_off_seconds).toBe(145)
  })

  it('prefers a separately tested stroke pace', () => {
    const tested = swimmer({ base_pace_by_stroke: { free: 120, breast: 200 } })

    expect(only('4x100 breast @ base+10', tested).send_off_seconds).toBe(210)
  })

  it('reads a literal interval as written', () => {
    expect(only('8x25 free @ 0:45').send_off_seconds).toBe(45)
  })

  it('leaves a set with no interval without one', () => {
    expect(only('300 free easy').send_off_seconds).toBeUndefined()
  })

  it('drops a relative interval on an activity with no base pace', () => {
    // Treading water has no stroke to look a base pace up for. Guessing one would
    // prescribe a send-off nobody can check.
    expect(only('2x1:00 tread water @ base+10').send_off_seconds).toBeUndefined()
  })

  it('drops a relative interval on an unpaced activity swum for a distance', () => {
    // An underwater dolphin is measured in distance but has no stroke to look a
    // base pace up for, so there is nothing to make `base+10` mean.
    expect(only('4x25 underwater dolphin @ base+10').send_off_seconds).toBeUndefined()
  })

  it('keeps a pace target separate from the send-off', () => {
    const set = only('8x100 free @ base+15 hold 1:50')

    expect(set.send_off_seconds).toBe(135)
    expect(set.pace_seconds).toBe(110)
  })
})

describe('the minimum-rest floor', () => {
  it('leaves a send-off that already gives enough rest alone', () => {
    expect(only('4x50 free @ base+15').send_off_seconds).toBe(75)
  })

  it('widens a send-off that would leave an adult less than five seconds', () => {
    // `base-5` asks a 50 to go out on 55s when base pace alone takes 60.
    expect(only('4x50 free @ base-5').send_off_seconds).toBe(60 + ADULT_CAPS.min_rest_seconds)
  })

  it('widens the same set further for a youth swimmer', () => {
    const youth = swimmer({ is_youth: true })

    expect(only('4x50 free @ base-5', youth).send_off_seconds).toBe(
      60 + YOUTH_CAPS.min_rest_seconds,
    )
  })

  it('widens a literal interval that is too tight', () => {
    expect(only('4x100 free @ 1:00').send_off_seconds).toBe(120 + ADULT_CAPS.min_rest_seconds)
  })

  it('never floors a pace target, which is how fast rather than when to leave', () => {
    // `hold base-10` is a legitimate instruction to swim faster than sustainable.
    expect(only('4x100 free hold base-10').pace_seconds).toBe(110)
  })

  it('leaves every send-off at least the minimum rest above the swim time', () => {
    const workout = resolveTemplate(
      template(
        ['main:', '  4x50 free @ base-20', '  8x100 free @ base+15', '  4x200 free @ 1:00'].join(
          '\n',
        ),
      ),
      swimmer(),
    )

    for (const set of sets(workout)) {
      if (set.send_off_seconds === undefined) continue
      const swimTime = set.parts.reduce(
        (total, part) =>
          total + (part.extent.kind === 'distance' ? (part.extent.value / 100) * 120 : 0),
        0,
      )
      expect(set.send_off_seconds - swimTime).toBeGreaterThanOrEqual(ADULT_CAPS.min_rest_seconds)
    }
  })
})

describe('total distance', () => {
  it('multiplies each set out and adds them up', () => {
    const workout = resolveTemplate(
      template(['warmup:', '  300 free easy', 'main:', '  8x100 free @ base+15'].join('\n')),
      swimmer(),
    )

    expect(workout.total_distance).toBe(300 + 800)
  })

  it('counts a timed set as the distance an easy swim would cover', () => {
    // 60s at base+20 per 100 is 42.8 of a 100, rounded to the nearest 25.
    const workout = resolveTemplate(
      template(['main:', '  2x1:00 tread water'].join('\n')),
      swimmer(),
    )

    expect(workout.total_distance).toBe(100)
  })

  it('is not zero for a workout made only of timed sets', () => {
    const workout = resolveTemplate(template(['main:', '  20:00 free'].join('\n')), swimmer())

    expect(workout.total_distance).toBeGreaterThan(0)
  })
})

describe('the youth session distance cap', () => {
  const long = [
    'main:',
    '  20x200 free @ base+20',
    '  10x100 free @ base+15',
    '  400 choice easy',
  ].join('\n')

  it('leaves an adult session uncapped', () => {
    const workout = resolveTemplate(template(long), swimmer())

    expect(workout.capped).toBe(false)
    expect(workout.total_distance).toBe(5400)
  })

  it('brings a youth session under the cap', () => {
    const workout = resolveTemplate(template(long), swimmer({ is_youth: true }))

    expect(workout.capped).toBe(true)
    expect(workout.total_distance).toBeLessThanOrEqual(YOUTH_CAPS.max_session_distance ?? 0)
  })

  it('says so rather than shrinking the session silently', () => {
    expect(resolveTemplate(template(long), swimmer({ is_youth: true })).capped).toBe(true)
  })

  it('takes repetitions off before dropping whole sets', () => {
    const workout = resolveTemplate(template(long), swimmer({ is_youth: true }))

    // The cooldown is the last set in the template and should survive trimming.
    expect(sets(workout).at(-1)?.raw.trim()).toBe('400 choice easy')
  })

  it('never leaves a set below one repetition', () => {
    const workout = resolveTemplate(template(long), swimmer({ is_youth: true }))

    for (const set of sets(workout)) expect(set.reps).toBeGreaterThanOrEqual(1)
  })

  it('drops whole sets when nothing is left to trim', () => {
    // Five 400s at one repetition each: there are no repetitions to take off, so
    // the only way under 1500 is to lose sets from the end.
    const singles = ['main:', ...Array.from({ length: 5 }, () => '  400 free @ base+20')].join('\n')
    const workout = resolveTemplate(template(singles), swimmer({ is_youth: true }))

    expect(workout.total_distance).toBeLessThanOrEqual(1500)
    expect(sets(workout)).toHaveLength(3)
  })

  it('cannot trim below one set, and says so when that leaves it over', () => {
    // A single 2000 is more than the youth cap and there is nothing to take off it.
    // Returning an empty workout would be worse, so the cap is reported unmet — a
    // template like this should never have been offered to a youth swimmer.
    const workout = resolveTemplate(
      template('main:\n  2000 free @ base+20'),
      swimmer({ is_youth: true }),
    )

    expect(sets(workout)).toHaveLength(1)
    expect(workout.capped).toBe(true)
    expect(workout.total_distance).toBe(2000)
  })

  it('caps a workout that is over even at one repetition each', () => {
    const huge = ['main:', ...Array.from({ length: 30 }, () => '  1000 free @ base+20')].join('\n')
    const workout = resolveTemplate(template(huge), swimmer({ is_youth: true }))

    expect(workout.total_distance).toBeLessThanOrEqual(YOUTH_CAPS.max_session_distance ?? 0)
    expect(sets(workout).length).toBeGreaterThanOrEqual(1)
  })
})

describe('what the resolver keeps', () => {
  it('keeps the line as the author wrote it', () => {
    expect(only('8x100 free @ base+15    # smooth').raw.trim()).toBe(
      '8x100 free @ base+15    # smooth',
    )
  })

  it('keeps the note, the pattern and the structure', () => {
    const set = only('4x50 free build 1-4 relay @ base+25    # count strokes')

    expect(set.note).toBe('count strokes')
    expect(set.pattern?.id).toBe('build')
    expect(set.structure).toBe('relay')
  })

  it('keeps the parts, so the workout view can show what is being swum', () => {
    const set = only('4x50 kick with board @ base+40')

    expect(set.parts[0].activity).toBe('kick')
    expect(set.parts[0].equipment).toEqual(['board'])
  })

  it('drops sections that hold no sets', () => {
    const workout = resolveTemplate(
      template(['name: Header only', '', 'main:', '  4x50 free'].join('\n')),
      swimmer(),
    )

    expect(workout.sections.map((section) => section.name)).toEqual(['main'])
  })

  it('records whose workout it is', () => {
    const workout = resolveTemplate(template('main:\n  4x50 free'), swimmer())

    expect(workout.swimmer_id).toBe('swimmer-1')
    expect(workout.template_id).toBe('template-1')
  })
})

/**
 * The spec's testing note, over the fixture library: every resolved distance is a
 * multiple of 25, and every send-off leaves real rest.
 */
describe('the template library resolves for every swimmer', () => {
  const pairs = demoTemplates().flatMap((each) =>
    demoSwimmers().map((who) => [`${each.name} for ${who.name}`, each, who] as const),
  )

  it.each(pairs)('%s resolves to whole pool lengths', (_name, each, who) => {
    for (const set of sets(resolveTemplate(each, who))) {
      for (const part of set.parts) {
        if (part.extent.kind !== 'distance') continue
        expect(part.extent.value % 25).toBe(0)
        expect(part.extent.value).toBeGreaterThan(0)
      }
    }
  })

  it.each(pairs)('%s leaves rest on every send-off', (_name, each, who) => {
    const caps = who.is_youth ? YOUTH_CAPS : ADULT_CAPS

    for (const set of sets(resolveTemplate(each, who))) {
      if (set.send_off_seconds === undefined) continue

      const swimTime = set.parts.reduce((total, part) => {
        if (part.extent.kind !== 'distance') return total
        return total + (part.extent.value / 100) * who.base_pace_by_stroke.free
      }, 0)

      // Only paced sets have a swim time to compare against; an unpaced one keeps
      // whatever literal interval it was given.
      if (swimTime === 0) continue
      expect(set.send_off_seconds).toBeGreaterThanOrEqual(swimTime + caps.min_rest_seconds)
    }
  })

  it.each(pairs)('%s stays within the caps that apply to the swimmer', (_name, each, who) => {
    const workout = resolveTemplate(each, who)
    const limit = (who.is_youth ? YOUTH_CAPS : ADULT_CAPS).max_session_distance

    expect(workout.total_distance).toBeGreaterThan(0)
    if (limit !== null) expect(workout.total_distance).toBeLessThanOrEqual(limit)
  })
})
