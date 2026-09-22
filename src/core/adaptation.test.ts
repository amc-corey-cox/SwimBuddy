import { describe, expect, it } from 'vitest'
import { adapt } from './adaptation'
import { ADULT_CAPS, YOUTH_CAPS } from './safety'
import type { EffortRating, Session, Swimmer } from './types'

const META = { created_at: 0, updated_at: 0, deleted: false }
const NOW = Date.UTC(2026, 5, 1)
const DAY = 24 * 60 * 60 * 1000

function swimmer(overrides: Partial<Swimmer> = {}): Swimmer {
  return {
    ...META,
    id: 'swimmer-1',
    name: 'Test',
    birth_year: 1980,
    base_pace_by_stroke: { free: 120 },
    load_factor: 1,
    is_youth: false,
    ...overrides,
  }
}

function session(daysAgo: number, overrides: Partial<Session> = {}): Session {
  return {
    ...META,
    id: `session-${String(daysAgo)}`,
    swimmer_id: 'swimmer-1',
    template_id: 'template-1',
    date: NOW - daysAgo * DAY,
    total_distance: 1000,
    completed: true,
    notes: '',
    ...overrides,
  }
}

function rated(daysAgo: number, effort: EffortRating, overrides: Partial<Session> = {}): Session {
  return session(daysAgo, { effort_rating: effort, ...overrides })
}

describe('the load factor', () => {
  it('does not move without a rated session', () => {
    expect(adapt(swimmer(), [], NOW).load_factor).toBe(1)
  })

  it('does not move after a single easy swim', () => {
    expect(adapt(swimmer(), [rated(1, 'too_easy')], NOW).load_factor).toBe(1)
  })

  it('goes up after two easy swims in a row', () => {
    const result = adapt(swimmer(), [rated(1, 'too_easy'), rated(3, 'too_easy')], NOW)

    expect(result.load_factor).toBeCloseTo(1.05)
    expect(result.reasons).toContain('Two easy swims in a row')
  })

  it('does not go up when one of the two was cut short', () => {
    // "Two consecutive too easy *and completed*" is the rule. Someone who got out
    // early did not find it easy enough to earn more work.
    const result = adapt(
      swimmer(),
      [rated(1, 'too_easy'), rated(3, 'too_easy', { completed: false })],
      NOW,
    )

    expect(result.load_factor).toBe(1)
  })

  it('goes down after one hard swim', () => {
    const result = adapt(swimmer(), [rated(1, 'too_hard')], NOW)

    expect(result.load_factor).toBeCloseTo(0.95)
    expect(result.reasons).toContain('Last swim was too hard')
  })

  it('goes down after one swim that was cut short', () => {
    const result = adapt(swimmer(), [rated(1, 'about_right', { completed: false })], NOW)

    expect(result.load_factor).toBeCloseTo(0.95)
    expect(result.reasons).toContain('Last swim was cut short')
  })

  it('backs off even when the swim before was easy', () => {
    // Backing off is never postponed by a rule about adding work.
    const result = adapt(swimmer(), [rated(1, 'too_hard'), rated(3, 'too_easy')], NOW)

    expect(result.load_factor).toBeCloseTo(0.95)
  })

  it('drops a tenth after ten days out of the water', () => {
    const result = adapt(swimmer(), [rated(20, 'about_right')], NOW)

    expect(result.load_factor).toBeCloseTo(0.9)
    expect(result.reasons).toContain('More than ten days since the last swim')
  })

  it('stays inside the bounds for an adult', () => {
    const high = adapt(
      swimmer({ load_factor: 1.4 }),
      [rated(1, 'too_easy'), rated(3, 'too_easy')],
      NOW,
    )
    const low = adapt(swimmer({ load_factor: 0.6 }), [rated(1, 'too_hard')], NOW)

    expect(high.load_factor).toBe(ADULT_CAPS.max_load_factor)
    expect(low.load_factor).toBe(ADULT_CAPS.min_load_factor)
  })

  it('stops a youth swimmer at their own ceiling', () => {
    const result = adapt(
      swimmer({ is_youth: true, load_factor: 1.15 }),
      [rated(1, 'too_easy'), rated(3, 'too_easy')],
      NOW,
    )

    expect(result.load_factor).toBe(YOUTH_CAPS.max_load_factor)
  })
})

describe('send-off relief', () => {
  it('is not given for a single hard swim', () => {
    expect(adapt(swimmer(), [rated(1, 'too_hard')], NOW).send_off_bonus_seconds).toBe(0)
  })

  it('is given after two hard swims in a row', () => {
    const result = adapt(swimmer(), [rated(1, 'too_hard'), rated(3, 'too_hard')], NOW)

    expect(result.send_off_bonus_seconds).toBe(3)
    expect(result.reasons).toContain('Easing send-offs after two hard swims')
  })

  it('lasts two sessions and then stops', () => {
    const pair = [rated(10, 'too_hard'), rated(12, 'too_hard')]

    const first = adapt(swimmer(), [rated(1, 'about_right'), ...pair], NOW)
    const second = adapt(
      swimmer(),
      [rated(1, 'about_right'), rated(3, 'about_right'), ...pair],
      NOW,
    )
    const third = adapt(
      swimmer(),
      [rated(1, 'about_right'), rated(3, 'about_right'), rated(5, 'about_right'), ...pair],
      NOW,
    )

    expect(first.send_off_bonus_seconds).toBe(3)
    expect(second.send_off_bonus_seconds).toBe(3)
    expect(third.send_off_bonus_seconds).toBe(0)
  })
})

describe('the weekly volume budget', () => {
  it('is unset for a swimmer with no trailing week', () => {
    expect(adapt(swimmer(), [session(1)], NOW).weekly_distance_budget).toBeNull()
  })

  it('allows ten percent more than the week before', () => {
    // 2000 last week, nothing yet this week, so 2200 is available.
    const sessions = [session(8, { total_distance: 1000 }), session(10, { total_distance: 1000 })]

    expect(adapt(swimmer(), sessions, NOW).weekly_distance_budget).toBe(2200)
  })

  it('counts what has already been swum this week', () => {
    const sessions = [
      session(1, { total_distance: 1500 }),
      session(8, { total_distance: 1000 }),
      session(10, { total_distance: 1000 }),
    ]

    expect(adapt(swimmer(), sessions, NOW).weekly_distance_budget).toBe(700)
  })

  it('never goes negative', () => {
    const sessions = [session(1, { total_distance: 9000 }), session(8, { total_distance: 1000 })]

    expect(adapt(swimmer(), sessions, NOW).weekly_distance_budget).toBe(0)
  })
})

/**
 * The spec's testing note: thirty sessions of synthetic ratings, asserting the
 * load factor stays in bounds and weekly volume never jumps more than ten percent.
 */
describe('thirty sessions of ratings', () => {
  const ratings: EffortRating[] = ['too_easy', 'about_right', 'too_hard']

  function simulate(who: Swimmer, pick: (index: number) => EffortRating) {
    const caps = who.is_youth ? YOUTH_CAPS : ADULT_CAPS
    const history: Session[] = []
    let current = who
    const observed: number[] = []

    for (let index = 0; index < 30; index += 1) {
      const at = NOW - (30 - index) * 2 * DAY
      const result = adapt(current, history, at)
      observed.push(result.load_factor)

      const budget = result.weekly_distance_budget
      const distance = budget === null ? 1200 : Math.min(1200, budget)

      // A budget of zero means the week is full, so there is no swim to record.
      // Recording a zero-distance one would empty the trailing week and hand the
      // following week an unlimited budget, which is the oscillation this avoids.
      if (distance === 0) {
        current = { ...current, load_factor: result.load_factor }
        continue
      }

      history.unshift({
        ...META,
        id: `s${String(index)}`,
        swimmer_id: who.id,
        template_id: 't',
        date: at,
        total_distance: distance,
        effort_rating: pick(index),
        completed: true,
        notes: '',
      })
      current = { ...current, load_factor: result.load_factor }
    }

    return { observed, history, caps }
  }

  it.each([
    ['always too easy', (): EffortRating => 'too_easy'],
    ['always too hard', (): EffortRating => 'too_hard'],
    ['alternating', (index: number): EffortRating => ratings[index % 3] ?? 'about_right'],
  ])('keeps the load factor in bounds when %s', (_name, pick) => {
    for (const who of [swimmer(), swimmer({ is_youth: true })]) {
      const { observed, caps } = simulate(who, pick)

      for (const value of observed) {
        expect(value).toBeGreaterThanOrEqual(caps.min_load_factor)
        expect(value).toBeLessThanOrEqual(caps.max_load_factor)
      }
    }
  })

  it('never lets weekly volume jump more than ten percent', () => {
    const { history } = simulate(swimmer(), (index) => ratings[index % 3] ?? 'about_right')

    const volumeIn = (end: number): number =>
      history
        .filter((session) => session.date > end - 7 * DAY && session.date <= end)
        .reduce((total, session) => total + session.total_distance, 0)

    for (const session of history) {
      const thisWeek = volumeIn(session.date)
      const priorWeek = volumeIn(session.date - 7 * DAY)
      // A trailing week of nothing is a break, governed by the layoff rule instead.
      if (priorWeek === 0) continue

      expect(thisWeek).toBeLessThanOrEqual(priorWeek * 1.1 + 0.001)
    }
  })
})
