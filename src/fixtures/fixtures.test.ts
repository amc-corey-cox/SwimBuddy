import { describe, expect, it } from 'vitest'
import { computeBasePace } from '../core/pace'
import { DAY_MS, FIXTURE_REFERENCE_DATE, demoStore } from './index'
import { SWIMMER_IDS } from './swimmers'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const store = demoStore()
const allRecords = [
  ...store.swimmers,
  ...store.templates,
  ...store.sessions,
  ...store.test_sets,
  store.settings,
]

describe('record envelope', () => {
  it('gives every record a valid UUIDv4', () => {
    const invalid = allRecords.filter((record) => !UUID_V4.test(record.id))
    expect(invalid.map((record) => record.id)).toEqual([])
  })

  it('never reuses an id, even across record types', () => {
    const ids = allRecords.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries both timestamps and a tombstone flag, with created_at no later than updated_at', () => {
    for (const record of allRecords) {
      expect(record.created_at).toBeLessThanOrEqual(record.updated_at)
      expect(record.deleted).toBe(false)
    }
  })

  it('places no record in the future relative to the reference date', () => {
    for (const record of allRecords) {
      expect(record.updated_at).toBeLessThanOrEqual(FIXTURE_REFERENCE_DATE)
    }
  })
})

describe('referential integrity', () => {
  const swimmerIds = new Set(store.swimmers.map((swimmer) => swimmer.id))
  const templateIds = new Set(store.templates.map((template) => template.id))

  it('points every session at a swimmer and a template that exist', () => {
    for (const session of store.sessions) {
      expect(swimmerIds).toContain(session.swimmer_id)
      expect(templateIds).toContain(session.template_id)
    }
  })

  it('points every test set at a swimmer that exists', () => {
    for (const testSet of store.test_sets) {
      expect(swimmerIds).toContain(testSet.swimmer_id)
    }
  })
})

describe('swimmers', () => {
  it('keeps every load factor inside the clamp', () => {
    for (const swimmer of store.swimmers) {
      expect(swimmer.load_factor).toBeGreaterThanOrEqual(0.6)
      expect(swimmer.load_factor).toBeLessThanOrEqual(1.4)
    }
  })

  it('respects the youth load factor cap of 1.15', () => {
    const youth = store.swimmers.filter((swimmer) => swimmer.is_youth)
    expect(youth.length).toBeGreaterThan(0)
    for (const swimmer of youth) {
      expect(swimmer.load_factor).toBeLessThanOrEqual(1.15)
    }
  })

  it('gives every swimmer a tested free pace', () => {
    for (const swimmer of store.swimmers) {
      expect(swimmer.base_pace_by_stroke.free).toBeGreaterThan(0)
    }
  })
})

describe('sessions', () => {
  it('records distances as positive multiples of 25', () => {
    for (const session of store.sessions) {
      expect(session.total_distance).toBeGreaterThan(0)
      expect(session.total_distance % 25).toBe(0)
    }
  })

  it('attaches a fun rating only to youth swimmers', () => {
    const youthIds = new Set(
      store.swimmers.filter((swimmer) => swimmer.is_youth).map((swimmer) => swimmer.id),
    )
    for (const session of store.sessions) {
      if (session.fun_rating !== undefined) {
        expect(youthIds).toContain(session.swimmer_id)
      }
    }
  })
})

describe('test sets agree with the swimmers they belong to', () => {
  it('derives computed_base_pace with the spec formula', () => {
    for (const testSet of store.test_sets) {
      expect(testSet.computed_base_pace).toBe(
        computeBasePace(testSet.t400, testSet.t200, testSet.protocol),
      )
    }
  })

  it("matches each swimmer's recorded free base pace", () => {
    for (const testSet of store.test_sets) {
      const swimmer = store.swimmers.find((candidate) => candidate.id === testSet.swimmer_id)
      expect(swimmer?.base_pace_by_stroke.free).toBe(testSet.computed_base_pace)
    }
  })

  it('uses the gentler 200/100 protocol for youth swimmers', () => {
    for (const testSet of store.test_sets) {
      const swimmer = store.swimmers.find((candidate) => candidate.id === testSet.swimmer_id)
      if (swimmer?.is_youth) expect(testSet.protocol).toBe('200/100')
    }
  })
})

describe('templates', () => {
  it('gives every template content, tags, and a sane level range', () => {
    for (const template of store.templates) {
      expect(template.raw_text.trim().length).toBeGreaterThan(0)
      expect(template.tags.length).toBeGreaterThan(0)
      expect(template.level_range.min).toBeLessThanOrEqual(template.level_range.max)
    }
  })

  it('leaves parsed_sets absent, since raw_text is the source of truth until step 3', () => {
    for (const template of store.templates) {
      expect(template.parsed_sets).toBeUndefined()
    }
  })

  it('covers the grammar the parser has to handle', () => {
    const corpus = store.templates.map((template) => template.raw_text).join('\n')
    expect(corpus).toMatch(/\{reps:\d+-\d+\}/) // rep slots
    expect(corpus).toMatch(/@ base\+\d+/) // base plus offset
    expect(corpus).toMatch(/@ base-\d+/) // base minus offset
    expect(corpus).toMatch(/@ base$/m) // bare base
    expect(corpus).toMatch(/@ \d+:\d{2}/) // literal clock interval
    expect(corpus).toMatch(/#/) // coaching note
  })

  it('includes lines that do not parse as sets, so step 3 must preserve them verbatim', () => {
    const toys = store.templates.find((template) => template.name === 'Toys and games')
    expect(toys?.raw_text).toContain('loser buys popsicles')
  })
})

/**
 * The fixture comments promise specific scenarios. Assert they are really there,
 * so the adaptation tests in step 7 can rely on them.
 */
describe('adaptation scenarios the fixtures claim to contain', () => {
  function sessionsFor(swimmerId: string) {
    return store.sessions
      .filter((session) => session.swimmer_id === swimmerId)
      .sort((a, b) => a.date - b.date)
  }

  it('ends the returning competitor on two consecutive completed "too easy" sessions', () => {
    const recent = sessionsFor(SWIMMER_IDS.returningCompetitor).slice(-2)
    expect(recent).toHaveLength(2)
    for (const session of recent) {
      expect(session.effort_rating).toBe('too_easy')
      expect(session.completed).toBe(true)
    }
  })

  it('includes a session that was cut short', () => {
    expect(store.sessions.some((session) => session.completed === false)).toBe(true)
  })

  it('leaves the fitness swimmer a layoff of more than ten days', () => {
    const dates = sessionsFor(SWIMMER_IDS.fitnessSwimmer).map((session) => session.date)
    const gaps = dates.slice(1).map((date, index) => date - dates[index]!)
    expect(Math.max(...gaps)).toBeGreaterThan(10 * DAY_MS)
  })

  it('gives the youth swimmer two consecutive thumbs-down', () => {
    const ratings = sessionsFor(SWIMMER_IDS.youth).map((session) => session.fun_rating)
    const hasConsecutiveDown = ratings.some(
      (rating, index) => rating === 'down' && ratings[index + 1] === 'down',
    )
    expect(hasConsecutiveDown).toBe(true)
  })
})

describe('determinism', () => {
  it('produces identical records for the same reference date', () => {
    expect(demoStore(FIXTURE_REFERENCE_DATE)).toEqual(demoStore(FIXTURE_REFERENCE_DATE))
  })

  it('shifts every date by the same delta when the reference date moves', () => {
    const shift = 30 * DAY_MS
    const shifted = demoStore(FIXTURE_REFERENCE_DATE + shift)

    expect(shifted.sessions).toHaveLength(store.sessions.length)
    shifted.sessions.forEach((session, index) => {
      expect(session.date - store.sessions[index]!.date).toBe(shift)
      expect(session.id).toBe(store.sessions[index]!.id)
    })
  })

  it('never reads the clock, so records do not depend on when tests run', () => {
    const before = demoStore()
    const after = demoStore()
    expect(after).toEqual(before)
  })
})
