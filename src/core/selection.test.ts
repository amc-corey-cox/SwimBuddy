import { describe, expect, it } from 'vitest'
import {
  estimateMinutes,
  selectForPractice,
  selectTemplate,
  type SelectionContext,
} from './selection'
import type { Session, Swimmer, Template } from './types'

const META = { created_at: 0, updated_at: 0, deleted: false }
const NOW = Date.UTC(2026, 5, 1)
const DAY = 24 * 60 * 60 * 1000

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

function template(id: string, overrides: Partial<Template> = {}): Template {
  return {
    ...META,
    id,
    name: id,
    tags: [],
    intensity: 'moderate',
    level_range: { min: 1, max: 5 },
    raw_text: 'main:\n  10x100 free @ base+15',
    ...overrides,
  }
}

function session(templateId: string, daysAgo: number, overrides: Partial<Session> = {}): Session {
  return {
    ...META,
    id: `session-${templateId}-${String(daysAgo)}`,
    swimmer_id: 'swimmer-1',
    template_id: templateId,
    date: NOW - daysAgo * DAY,
    total_distance: 1000,
    notes: '',
    ...overrides,
  }
}

function context(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return {
    swimmer: swimmer(),
    templates: [template('a')],
    recentSessions: [],
    requestedMinutes: 45,
    now: NOW,
    ...overrides,
  }
}

describe('estimateMinutes', () => {
  it('scales with distance and the swimmer own base pace', () => {
    // 1000 at 120+15 per 100 is 1350 seconds, near enough 23 minutes.
    expect(estimateMinutes(1000, swimmer())).toBe(23)
    expect(estimateMinutes(1000, swimmer({ base_pace_by_stroke: { free: 90 } }))).toBe(18)
  })
})

describe('choosing a template', () => {
  it('returns nothing when there is nothing to choose from', () => {
    expect(selectTemplate(context({ templates: [] }))).toBeUndefined()
  })

  it('ignores a deleted template', () => {
    expect(
      selectTemplate(context({ templates: [template('a', { deleted: true })] })),
    ).toBeUndefined()
  })

  it('prefers the template closest to the length that was asked for', () => {
    const short = template('short', { raw_text: 'main:\n  4x100 free @ base+15' })
    const long = template('long', { raw_text: 'main:\n  20x100 free @ base+15' })

    const chosen = selectTemplate(context({ templates: [short, long], requestedMinutes: 10 }))

    expect(chosen?.template.id).toBe('short')
  })

  it('never offers a hard session straight after a hard one', () => {
    const hard = template('hard', { intensity: 'hard' })
    const easy = template('easy', { intensity: 'easy' })

    const chosen = selectTemplate(
      context({ templates: [hard, easy], recentSessions: [session('hard', 1)] }),
    )

    expect(chosen?.template.id).toBe('easy')
    expect(chosen?.reasons).toContain('Last swim was hard, so this one is not')
  })

  it('offers nothing rather than a second hard session', () => {
    const hard = template('hard', { intensity: 'hard' })

    expect(
      selectTemplate(context({ templates: [hard], recentSessions: [session('hard', 1)] })),
    ).toBeUndefined()
  })

  it('prefers tags that have not come up in the last three sessions', () => {
    const stale = template('stale', { tags: ['sprint'] })
    const fresh = template('fresh', { tags: ['drill'] })

    const chosen = selectTemplate(
      context({
        templates: [stale, fresh],
        recentSessions: [session('stale', 1), session('stale', 3), session('stale', 5)],
      }),
    )

    expect(chosen?.template.id).toBe('fresh')
  })

  it('stops counting tags older than three sessions', () => {
    const stale = template('stale', { tags: ['sprint'] })
    const fresh = template('fresh', { tags: ['drill'] })

    const chosen = selectTemplate(
      context({
        templates: [stale, fresh],
        // The sprint session is fourth, so it no longer counts as recent.
        recentSessions: [
          session('fresh', 1),
          session('fresh', 2),
          session('fresh', 3),
          session('stale', 4),
        ],
      }),
    )

    expect(chosen?.template.id).toBe('stale')
  })

  it('starts shorter after a layoff', () => {
    const short = template('short', { raw_text: 'main:\n  6x100 free @ base+15' })
    const long = template('long', { raw_text: 'main:\n  16x100 free @ base+15' })

    const rested = selectTemplate(
      context({
        templates: [short, long],
        recentSessions: [session('long', 1)],
        requestedMinutes: 40,
      }),
    )
    const returning = selectTemplate(
      context({
        templates: [short, long],
        recentSessions: [session('long', 30)],
        requestedMinutes: 40,
      }),
    )

    expect(rested?.template.id).toBe('long')
    expect(returning?.template.id).toBe('short')
    expect(returning?.reasons).toContain('Been a while — starting shorter')
  })

  it('treats a first-ever swim as a layoff', () => {
    const short = template('short', { raw_text: 'main:\n  6x100 free @ base+15' })
    const long = template('long', { raw_text: 'main:\n  16x100 free @ base+15' })

    const chosen = selectTemplate(
      context({ templates: [short, long], recentSessions: [], requestedMinutes: 40 }),
    )

    expect(chosen?.template.id).toBe('short')
  })
})

describe('the youth swimmer', () => {
  const youth = swimmer({ is_youth: true })

  it('is never offered a template that busts the distance cap', () => {
    // The resolver cannot trim a single 2000 under the cap, so selection must not
    // put it in front of a child in the first place.
    const huge = template('huge', { raw_text: 'main:\n  2000 free @ base+20' })
    const fine = template('fine', { raw_text: 'main:\n  4x100 free @ base+20' })

    const chosen = selectTemplate(context({ swimmer: youth, templates: [huge, fine] }))

    expect(chosen?.template.id).toBe('fine')
  })

  it('offers nothing rather than something over the cap', () => {
    const huge = template('huge', { raw_text: 'main:\n  2000 free @ base+20' })

    expect(selectTemplate(context({ swimmer: youth, templates: [huge] }))).toBeUndefined()
  })

  it('leans on drill and fun after two thumbs down', () => {
    const plain = template('plain', { tags: ['endurance'] })
    const fun = template('fun', { tags: ['fun'] })

    const chosen = selectTemplate(
      context({
        swimmer: youth,
        templates: [plain, fun],
        recentSessions: [
          session('plain', 1, { fun_rating: 'down' }),
          session('plain', 3, { fun_rating: 'down' }),
        ],
      }),
    )

    expect(chosen?.template.id).toBe('fun')
    expect(chosen?.reasons).toContain('Picked for variety')
  })

  it('does not lean on fun after a single thumbs down', () => {
    const plain = template('plain', { tags: ['endurance'] })
    const fun = template('fun', { tags: ['fun'] })

    const chosen = selectTemplate(
      context({
        swimmer: youth,
        templates: [plain, fun],
        recentSessions: [
          session('plain', 1, { fun_rating: 'down' }),
          session('plain', 3, { fun_rating: 'up' }),
        ],
      }),
    )

    expect(chosen?.reasons).not.toContain('Picked for variety')
  })

  it('does not apply the fun rule to an adult', () => {
    const plain = template('plain', { tags: ['endurance'] })

    const chosen = selectTemplate(
      context({
        templates: [plain],
        recentSessions: [
          session('plain', 1, { fun_rating: 'down' }),
          session('plain', 3, { fun_rating: 'down' }),
        ],
      }),
    )

    expect(chosen?.reasons).not.toContain('Picked for variety')
  })
})

describe('the weekly budget', () => {
  it('is ignored when there is none', () => {
    expect(selectTemplate(context())?.template.id).toBe('a')
  })

  it('rules out a template that would break the week', () => {
    const big = template('big', { raw_text: 'main:\n  10x100 free @ base+15' })
    const small = template('small', { raw_text: 'main:\n  2x100 free @ base+15' })

    const chosen = selectTemplate(context({ templates: [big, small], weeklyDistanceBudget: 400 }))

    expect(chosen?.template.id).toBe('small')
  })

  it('offers nothing when the week is full', () => {
    // Better to be told the week is done than handed a token workout: the
    // resolver will not trim below one set, so something would always be over.
    expect(selectTemplate(context({ weeklyDistanceBudget: 0 }))).toBeUndefined()
  })
})

describe('the reasons given', () => {
  it('always says how long it will take', () => {
    expect(selectTemplate(context())?.reasons[0]).toMatch(/^About \d+ minutes$/)
  })

  it('names the tags that are new this week', () => {
    const chosen = selectTemplate(context({ templates: [template('a', { tags: ['im'] })] }))

    expect(chosen?.reasons).toContain('New this week: im')
  })
})

describe('selecting for a practice', () => {
  it('offers one arrangement to everybody rather than one each', () => {
    const selection = selectForPractice({
      swimmers: [
        { swimmer: swimmer({ id: 'a' }), recentSessions: [] },
        { swimmer: swimmer({ id: 'b', base_pace_by_stroke: { free: 90 } }), recentSessions: [] },
      ],
      templates: [template('one'), template('two')],
      requestedMinutes: 45,
      now: NOW,
    })

    expect(selection).toBeDefined()
    expect(selection?.reasons[0]).toBe('Chosen to suit all 2 swimmers.')
  })

  it('refuses a template any one swimmer may not be given', () => {
    // One set of 2000 cannot be trimmed under the youth cap, because the resolver
    // will not go below a single set. So it is eligible for the adult and not for
    // the youth swimmer, and a practice containing both cannot be given it.
    const long = template('long', { raw_text: 'main:\n  2000 free @ base+15' })
    const short = template('short', { raw_text: 'main:\n  4x100 free @ base+15' })

    const adultOnly = selectForPractice({
      swimmers: [{ swimmer: swimmer({ id: 'a' }), recentSessions: [] }],
      templates: [long, short],
      requestedMinutes: 75,
      now: NOW,
    })
    expect(adultOnly?.template.id).toBe('long')

    const withYouth = selectForPractice({
      swimmers: [
        { swimmer: swimmer({ id: 'a' }), recentSessions: [] },
        { swimmer: swimmer({ id: 'b', is_youth: true }), recentSessions: [] },
      ],
      templates: [long, short],
      requestedMinutes: 75,
      now: NOW,
    })
    expect(withYouth?.template.id).toBe('short')
  })

  it('is steered by the swimmer the arrangement suits worst', () => {
    // One hard session yesterday for one swimmer takes the hard template off the
    // table for the whole practice.
    const hard = template('hard', { intensity: 'hard' })
    const easy = template('easy', { intensity: 'moderate' })

    const yesterday: Session = {
      ...META,
      id: 'session-1',
      swimmer_id: 'b',
      template_id: 'hard',
      date: NOW - DAY,
      resolved_sets: [],
      total_distance: 2000,
      effort_rating: 'about_right',
      completed: true,
      notes: '',
    }

    const selection = selectForPractice({
      swimmers: [
        { swimmer: swimmer({ id: 'a' }), recentSessions: [] },
        { swimmer: swimmer({ id: 'b' }), recentSessions: [yesterday] },
      ],
      templates: [hard, easy],
      requestedMinutes: 45,
      now: NOW,
    })

    expect(selection?.template.id).toBe('easy')
  })

  it('names the swimmer whose history set the choice', () => {
    const yesterday: Session = {
      ...META,
      id: 'session-1',
      swimmer_id: 'b',
      template_id: 'endurance',
      date: NOW - DAY,
      resolved_sets: [],
      total_distance: 2000,
      effort_rating: 'about_right',
      completed: true,
      notes: '',
    }

    const selection = selectForPractice({
      swimmers: [
        { swimmer: swimmer({ id: 'a', name: 'Avery' }), recentSessions: [] },
        { swimmer: swimmer({ id: 'b', name: 'Rowan' }), recentSessions: [yesterday] },
      ],
      templates: [template('endurance', { tags: ['endurance'] }), template('sprint')],
      requestedMinutes: 45,
      now: NOW,
    })

    expect(selection?.reasons.some((reason) => reason.startsWith('Rowan: '))).toBe(true)
  })

  it('reports the time the slowest swimmer will take', () => {
    const selection = selectForPractice({
      swimmers: [
        { swimmer: swimmer({ id: 'a', base_pace_by_stroke: { free: 90 } }), recentSessions: [] },
        { swimmer: swimmer({ id: 'b', base_pace_by_stroke: { free: 150 } }), recentSessions: [] },
      ],
      templates: [template('one')],
      requestedMinutes: 45,
      now: NOW,
    })

    const slowest = estimateMinutes(1000, swimmer({ base_pace_by_stroke: { free: 150 } }))
    expect(selection?.estimated_minutes).toBeGreaterThanOrEqual(slowest - 1)
  })

  it('offers nothing to a practice with nobody in it', () => {
    expect(
      selectForPractice({
        swimmers: [],
        templates: [template('one')],
        requestedMinutes: 45,
        now: NOW,
      }),
    ).toBeUndefined()
  })

  it('offers nothing when no arrangement clears everybody', () => {
    const selection = selectForPractice({
      swimmers: [
        { swimmer: swimmer({ id: 'a' }), recentSessions: [], weeklyDistanceBudget: 0 },
        { swimmer: swimmer({ id: 'b' }), recentSessions: [] },
      ],
      templates: [template('one')],
      requestedMinutes: 45,
      now: NOW,
    })

    expect(selection).toBeUndefined()
  })

  it('says so plainly when the practice is one person', () => {
    const selection = selectForPractice({
      swimmers: [{ swimmer: swimmer({ id: 'a' }), recentSessions: [] }],
      templates: [template('one')],
      requestedMinutes: 45,
      now: NOW,
    })

    expect(selection?.reasons[0]).toBe('One swimmer in this practice.')
  })
})
