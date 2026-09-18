import type { Template } from '../core/types'
import { FIXTURE_REFERENCE_DATE, daysBefore } from './constants'

/**
 * Workout templates in the shorthand from CLAUDE.md.
 *
 * These double as the parser's test corpus for build order step 3, so between
 * them they exercise the whole grammar: `{reps:MIN-MAX}` slots, `base+N`,
 * `base-N`, bare `base`, literal clock intervals, `#` coaching notes, section
 * headers, and lines that deliberately do not parse as sets — the parser must
 * preserve those verbatim rather than drop them.
 *
 * `parsed_sets` is intentionally absent: `raw_text` is the source of truth, and
 * hand-written parse output would rot the moment the real parser lands.
 */
export function demoTemplates(referenceDate: number = FIXTURE_REFERENCE_DATE): Template[] {
  const meta = {
    created_at: daysBefore(referenceDate, 120),
    updated_at: daysBefore(referenceDate, 120),
    deleted: false,
  }

  return [
    {
      ...meta,
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      name: 'Aerobic base — free',
      tags: ['endurance', 'free'],
      intensity: 'moderate',
      level_range: { min: 2, max: 4 },
      raw_text: [
        'name: Aerobic base — free',
        'tags: endurance, free',
        'intensity: moderate',
        'level: 2-4',
        '',
        'warmup:',
        '  300 swim free easy',
        '  4x50 free @ base+25    # build 1-4',
        '',
        'drill:',
        '  4x75 free drill/swim @ base+30',
        '',
        'main:',
        '  {reps:4-8}x100 free @ base+15',
        '  50 easy',
        '  {reps:2-4}x200 free @ base+20',
        '',
        'cooldown:',
        '  200 choice easy',
      ].join('\n'),
    },
    {
      ...meta,
      id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      name: 'Sprint and IM',
      tags: ['sprint', 'im'],
      intensity: 'hard',
      level_range: { min: 3, max: 5 },
      raw_text: [
        'name: Sprint and IM',
        'tags: sprint, im',
        'intensity: hard',
        'level: 3-5',
        '',
        'warmup:',
        '  400 choice easy',
        '',
        'main:',
        '  8x25 free @ 0:45    # all-out, full rest',
        '  {reps:2-4}x100 IM @ base+30',
        '  4x50 free @ base-5    # faster than base pace',
        '  100 easy @ base',
        '',
        'cooldown:',
        '  200 choice easy',
      ].join('\n'),
    },
    {
      ...meta,
      id: 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f',
      name: 'Toys and games',
      tags: ['fun', 'drill', 'youth'],
      intensity: 'easy',
      level_range: { min: 1, max: 3 },
      raw_text: [
        'name: Toys and games',
        'tags: fun, drill, youth',
        'intensity: easy',
        'level: 1-3',
        '',
        'warmup:',
        '  200 choice easy',
        '',
        'main:',
        '  4x50 kick with board @ base+40',
        '  Relay: 4x25 with a partner, loser buys popsicles',
        '  {reps:2-4}x25 underwater dolphin, no breath past the flags',
        '  6x25 stroke of the day @ 1:00',
        '',
        'cooldown:',
        '  100 easy, float on your back and look at the ceiling',
      ].join('\n'),
    },
  ]
}

export const TEMPLATE_IDS = {
  aerobicBase: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  sprintIm: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  toysAndGames: 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f',
} as const
