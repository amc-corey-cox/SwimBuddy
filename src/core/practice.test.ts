import { describe, expect, it } from 'vitest'
import { resolvePractice } from './practice'
import { YOUTH_CAPS } from './safety'
import type { Swimmer, Template } from './types'

const META = { created_at: 0, updated_at: 0, deleted: false }

function swimmer(id: string, basePace: number, overrides: Partial<Swimmer> = {}): Swimmer {
  return {
    ...META,
    id,
    name: id,
    base_pace_by_stroke: { free: basePace },
    load_factor: 1,
    is_youth: false,
    ...overrides,
  }
}

function template(raw: string): Template {
  return {
    ...META,
    id: 'template-1',
    name: 'Test',
    tags: [],
    intensity: 'moderate',
    level_range: { min: 1, max: 5 },
    raw_text: raw,
    parsed_sets: [],
  }
}

/** Every set in a workout, flattened, so a position is easy to reach. */
function sets(participant: { workout: { sections: readonly { sets: readonly unknown[] }[] } }) {
  return participant.workout.sections.flatMap((section) => section.sets)
}

describe('resolving a practice', () => {
  it('leaves one swimmer exactly as the resolver left them', () => {
    const [only] = resolvePractice(template('main:\n  6x100 free @ base+15'), [
      { swimmer: swimmer('a', 120) },
    ])

    expect(only?.extended_sets).toBe(0)
    expect(sets(only!)[0]).toMatchObject({ reps: 6 })
  })

  it('gives the faster swimmer more repetitions rather than more rest', () => {
    // 100s at base+15: the fast swimmer leaves every 1:45, the slow one every
    // 2:45. Six for the slow swimmer is 16:30, which is nine for the fast one.
    const practice = resolvePractice(template('main:\n  6x100 free @ base+15'), [
      { swimmer: swimmer('fast', 90) },
      { swimmer: swimmer('slow', 150) },
    ])

    const fast = practice.find((entry) => entry.swimmer.id === 'fast')
    const slow = practice.find((entry) => entry.swimmer.id === 'slow')

    expect((sets(slow!)[0] as { reps: number }).reps).toBe(6)
    expect((sets(fast!)[0] as { reps: number }).reps).toBeGreaterThan(6)
    expect(fast?.extended_sets).toBe(1)
    expect(slow?.extended_sets).toBe(0)
  })

  it('leaves the slowest swimmer alone, so nobody is given a shorter workout', () => {
    const practice = resolvePractice(template('main:\n  8x50 free @ base+20'), [
      { swimmer: swimmer('fast', 80) },
      { swimmer: swimmer('slow', 160) },
    ])

    const slow = practice.find((entry) => entry.swimmer.id === 'slow')
    expect((sets(slow!)[0] as { reps: number }).reps).toBe(8)
  })

  it('lands everybody within one repetition of the same amount of time', () => {
    const practice = resolvePractice(template('main:\n  6x100 free @ base+15'), [
      { swimmer: swimmer('fast', 90) },
      { swimmer: swimmer('middle', 120) },
      { swimmer: swimmer('slow', 150) },
    ])

    const minutes = practice.map((entry) => {
      const set = sets(entry)[0] as { reps: number; send_off_seconds: number }
      return set.reps * set.send_off_seconds
    })

    const spread = Math.max(...minutes) - Math.min(...minutes)
    const longestSendOff = 150 + 15
    expect(spread).toBeLessThan(longestSendOff)
  })

  it('will not grow a set past double what the author wrote', () => {
    // An absurd spread: without a ceiling the fast swimmer's 4x100 becomes 11x100,
    // which is a different set from the one in the library.
    const practice = resolvePractice(template('main:\n  4x100 free @ base+10'), [
      { swimmer: swimmer('fast', 60) },
      { swimmer: swimmer('slow', 300) },
    ])

    const fast = practice.find((entry) => entry.swimmer.id === 'fast')
    expect((sets(fast!)[0] as { reps: number }).reps).toBeLessThanOrEqual(8)
  })

  it('never adds repetitions past a youth distance cap', () => {
    // The youth swimmer is the fast one here, so balancing would otherwise push
    // them over the cap the resolver just brought them under.
    const practice = resolvePractice(template('main:\n  10x100 free @ base+10'), [
      { swimmer: swimmer('youth', 70, { is_youth: true }) },
      { swimmer: swimmer('adult', 200) },
    ])

    const youth = practice.find((entry) => entry.swimmer.id === 'youth')
    expect(youth?.workout.total_distance).toBeLessThanOrEqual(YOUTH_CAPS.max_session_distance ?? 0)
  })

  it('respects a weekly budget the same way', () => {
    const practice = resolvePractice(template('main:\n  8x100 free @ base+10'), [
      { swimmer: swimmer('fast', 70), options: { maxDistance: 800 } },
      { swimmer: swimmer('slow', 200) },
    ])

    const fast = practice.find((entry) => entry.swimmer.id === 'fast')
    expect(fast?.workout.total_distance).toBeLessThanOrEqual(800)
  })

  it('balances a set with no send-off by how long it takes to swim', () => {
    const practice = resolvePractice(template('warmup:\n  2x200 free easy'), [
      { swimmer: swimmer('fast', 80) },
      { swimmer: swimmer('slow', 160) },
    ])

    const fast = practice.find((entry) => entry.swimmer.id === 'fast')
    expect((sets(fast!)[0] as { reps: number }).reps).toBeGreaterThan(2)
  })

  it('leaves a timed set alone, because a minute is a minute for everyone', () => {
    const practice = resolvePractice(template('cooldown:\n  2x1:00 tread water'), [
      { swimmer: swimmer('fast', 80) },
      { swimmer: swimmer('slow', 160) },
    ])

    for (const entry of practice) {
      expect((sets(entry)[0] as { reps: number }).reps).toBe(2)
    }
  })

  it('reports the distance it actually ended up with', () => {
    const practice = resolvePractice(template('main:\n  6x100 free @ base+15'), [
      { swimmer: swimmer('fast', 90) },
      { swimmer: swimmer('slow', 150) },
    ])

    for (const entry of practice) {
      const total = entry.workout.sections
        .flatMap((section) => section.sets)
        .reduce((sum, set) => sum + set.reps * 100, 0)
      expect(entry.workout.total_distance).toBe(total)
    }
  })
})

describe('practices that cannot be balanced', () => {
  it('handles nobody at all', () => {
    expect(resolvePractice(template('main:\n  6x100 free @ base+15'), [])).toEqual([])
  })

  it('skips positions a trimmed workout never reaches', () => {
    // The youth cap cuts the young swimmer's workout short, so the later sets
    // exist for the adult alone. Those are positions the youth swimmer is
    // already done with rather than ones to balance.
    // Four single 500s. Repetitions cannot come off a set of one, so the cap has
    // to drop a whole set, leaving the youth swimmer with fewer than the adult.
    const long = template(
      'main:\n  500 free @ base+30\n  500 free @ base+30\n  500 free @ base+30\n  500 free @ base+30',
    )
    // The adult goes first so the longer workout is the one being walked: the
    // positions past the youth swimmer's last set are the ones to skip.
    const practice = resolvePractice(long, [
      { swimmer: swimmer('adult', 120) },
      { swimmer: swimmer('youth', 120, { is_youth: true }) },
    ])

    const youth = practice.find((entry) => entry.swimmer.id === 'youth')
    const adult = practice.find((entry) => entry.swimmer.id === 'adult')

    const youthSets = youth?.workout.sections.flatMap((section) => section.sets) ?? []
    const adultSets = adult?.workout.sections.flatMap((section) => section.sets) ?? []

    expect(youthSets.length).toBeLessThan(adultSets.length)
    expect(youth?.workout.total_distance).toBeLessThanOrEqual(YOUTH_CAPS.max_session_distance ?? 0)
  })
})
