import type { EffortRating, FunRating, Session, Uuid } from '../core/types'
import { FIXTURE_REFERENCE_DATE, daysBefore } from './constants'
import { SWIMMER_IDS } from './swimmers'
import { TEMPLATE_IDS } from './templates'

interface SessionSpec {
  readonly days_ago: number
  readonly swimmer_id: Uuid
  readonly template_id: Uuid
  readonly total_distance: number
  readonly effort_rating: EffortRating
  readonly completed: boolean
  readonly fun_rating?: FunRating
  readonly notes?: string
}

/**
 * Roughly eight weeks of history, authored to exercise the adaptation rules in
 * build order step 7 rather than to look tidy:
 *
 * - Avery closes with two consecutive `too_easy` completions (load factor up).
 * - Rowan has a `too_hard`, and separately a session cut short.
 * - Rowan's gap between days 28 and 14 is over ten days (layoff rule).
 * - Quinn has two consecutive thumbs-down (biases selection toward drill/fun).
 * - Quinn never exceeds the youth caps.
 */
const SESSION_SPECS: readonly SessionSpec[] = [
  // --- Avery: steady build, finishing too easy twice in a row ---
  {
    days_ago: 30,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 2200,
    effort_rating: 'too_hard',
    completed: false,
    notes: 'First swim back. Humbling.',
  },
  {
    days_ago: 26,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 2000,
    effort_rating: 'about_right',
    completed: true,
  },
  {
    days_ago: 23,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 2200,
    effort_rating: 'about_right',
    completed: true,
  },
  {
    days_ago: 19,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.sprintIm,
    total_distance: 2100,
    effort_rating: 'too_hard',
    completed: true,
    notes: 'IM legs are gone.',
  },
  {
    days_ago: 16,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 2400,
    effort_rating: 'about_right',
    completed: true,
  },
  {
    days_ago: 12,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 2500,
    effort_rating: 'about_right',
    completed: true,
  },
  {
    days_ago: 9,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 2600,
    effort_rating: 'too_easy',
    completed: true,
  },
  {
    days_ago: 5,
    swimmer_id: SWIMMER_IDS.returningCompetitor,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 2700,
    effort_rating: 'too_easy',
    completed: true,
    notes: 'Could have kept going.',
  },

  // --- Rowan: a layoff, then easing back ---
  {
    days_ago: 28,
    swimmer_id: SWIMMER_IDS.fitnessSwimmer,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 1800,
    effort_rating: 'about_right',
    completed: true,
  },
  {
    days_ago: 14,
    swimmer_id: SWIMMER_IDS.fitnessSwimmer,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 1600,
    effort_rating: 'too_hard',
    completed: false,
    notes: 'Two weeks off. Felt it.',
  },
  {
    days_ago: 10,
    swimmer_id: SWIMMER_IDS.fitnessSwimmer,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 1500,
    effort_rating: 'about_right',
    completed: true,
  },
  {
    days_ago: 6,
    swimmer_id: SWIMMER_IDS.fitnessSwimmer,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 1600,
    effort_rating: 'about_right',
    completed: true,
  },
  {
    days_ago: 3,
    swimmer_id: SWIMMER_IDS.fitnessSwimmer,
    template_id: TEMPLATE_IDS.toysAndGames,
    total_distance: 1400,
    effort_rating: 'too_easy',
    completed: true,
    notes: 'Swam the kid workout. It was fun.',
  },

  // --- Quinn: two thumbs-down in a row, then a fun template ---
  {
    days_ago: 27,
    swimmer_id: SWIMMER_IDS.youth,
    template_id: TEMPLATE_IDS.toysAndGames,
    total_distance: 1200,
    effort_rating: 'about_right',
    completed: true,
    fun_rating: 'up',
  },
  {
    days_ago: 24,
    swimmer_id: SWIMMER_IDS.youth,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 1300,
    effort_rating: 'about_right',
    completed: true,
    fun_rating: 'down',
    notes: 'Too many 100s in a row.',
  },
  {
    days_ago: 20,
    swimmer_id: SWIMMER_IDS.youth,
    template_id: TEMPLATE_IDS.aerobicBase,
    total_distance: 1300,
    effort_rating: 'too_hard',
    completed: false,
    fun_rating: 'down',
    notes: 'Boring.',
  },
  {
    days_ago: 15,
    swimmer_id: SWIMMER_IDS.youth,
    template_id: TEMPLATE_IDS.toysAndGames,
    total_distance: 1200,
    effort_rating: 'about_right',
    completed: true,
    fun_rating: 'up',
  },
  {
    days_ago: 11,
    swimmer_id: SWIMMER_IDS.youth,
    template_id: TEMPLATE_IDS.toysAndGames,
    total_distance: 1250,
    effort_rating: 'too_easy',
    completed: true,
    fun_rating: 'up',
  },
  {
    days_ago: 7,
    swimmer_id: SWIMMER_IDS.youth,
    template_id: TEMPLATE_IDS.toysAndGames,
    total_distance: 1350,
    effort_rating: 'about_right',
    completed: true,
    fun_rating: 'up',
    notes: 'Underwater kick got faster.',
  },
  {
    days_ago: 4,
    swimmer_id: SWIMMER_IDS.youth,
    template_id: TEMPLATE_IDS.toysAndGames,
    total_distance: 1400,
    effort_rating: 'about_right',
    completed: true,
    fun_rating: 'up',
  },
]

/** Deterministic, valid-shape UUIDv4s so fixtures are stable across runs. */
function fixtureSessionId(index: number): Uuid {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

export function demoSessions(referenceDate: number = FIXTURE_REFERENCE_DATE): Session[] {
  return SESSION_SPECS.map((spec, index) => {
    const date = daysBefore(referenceDate, spec.days_ago)
    return {
      id: fixtureSessionId(index + 1),
      created_at: date,
      updated_at: date,
      deleted: false,
      swimmer_id: spec.swimmer_id,
      template_id: spec.template_id,
      date,
      total_distance: spec.total_distance,
      effort_rating: spec.effort_rating,
      completed: spec.completed,
      notes: spec.notes ?? '',
      ...(spec.fun_rating ? { fun_rating: spec.fun_rating } : {}),
    }
  })
}
