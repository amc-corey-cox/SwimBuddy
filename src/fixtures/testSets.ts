import type { TestSet } from '../core/types'
import { computeBasePace } from '../core/pace'
import { FIXTURE_REFERENCE_DATE, daysBefore } from './constants'
import { SWIMMER_IDS } from './swimmers'

/**
 * Rested base pace tests. Times are chosen so each swimmer's computed pace
 * matches the `base_pace_by_stroke.free` on their fixture record — a test
 * asserts that, so the two cannot drift apart.
 *
 * `computed_base_pace` is derived rather than hand-written, for the same reason.
 */
export function demoTestSets(referenceDate: number = FIXTURE_REFERENCE_DATE): TestSet[] {
  const specs = [
    {
      id: 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f80',
      swimmer_id: SWIMMER_IDS.returningCompetitor,
      days_ago: 35,
      protocol: '400/200' as const,
      // 6:10 and 3:00.
      t400: 370,
      t200: 180,
    },
    {
      id: 'e5f6a7b8-c9d0-4e1f-8a3b-4c5d6e7f8091',
      swimmer_id: SWIMMER_IDS.fitnessSwimmer,
      days_ago: 35,
      protocol: '400/200' as const,
      // 7:30 and 3:40.
      t400: 450,
      t200: 220,
    },
    {
      id: 'f6a7b8c9-d0e1-4f2a-8b4c-5d6e7f809103',
      swimmer_id: SWIMMER_IDS.youth,
      days_ago: 33,
      // Youth swim a 200/100 and are never pushed to maximal effort.
      protocol: '200/100' as const,
      // 3:20 and 1:35.
      t400: 200,
      t200: 95,
    },
  ]

  return specs.map((spec) => {
    const date = daysBefore(referenceDate, spec.days_ago)
    return {
      id: spec.id,
      created_at: date,
      updated_at: date,
      deleted: false,
      swimmer_id: spec.swimmer_id,
      date,
      protocol: spec.protocol,
      t400: spec.t400,
      t200: spec.t200,
      computed_base_pace: computeBasePace(spec.t400, spec.t200, spec.protocol),
    }
  })
}
