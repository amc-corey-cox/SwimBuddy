import { CATALOGUE_SHIPPED_AT } from './catalogue'
import type { Template } from './types'

/**
 * The workout arrangements Swim Buddy ships with.
 *
 * Deliberately small. Variety comes from the model — a swimmer's load factor, the
 * repetition slots, the catalogue — not from the size of this list, and a library
 * of hand-authored strings is the thing the set model exists to avoid.
 *
 * Ids are fixed rather than generated so that two phones seeding independently
 * agree about which template a session was swum from.
 */
function arrangement(
  id: string,
  name: string,
  tags: readonly string[],
  intensity: Template['intensity'],
  level: { min: number; max: number },
  lines: readonly string[],
): Template {
  return {
    id,
    created_at: CATALOGUE_SHIPPED_AT,
    updated_at: CATALOGUE_SHIPPED_AT,
    deleted: false,
    name,
    tags,
    intensity,
    level_range: level,
    raw_text: [
      `name: ${name}`,
      `tags: ${tags.join(', ')}`,
      `intensity: ${intensity}`,
      `level: ${String(level.min)}-${String(level.max)}`,
      '',
      ...lines,
    ].join('\n'),
  }
}

export const SHIPPED_TEMPLATES: readonly Template[] = [
  arrangement(
    '0a5f1d2c-7b64-4e18-9c30-1f2a4b6c8d01',
    'Aerobic base',
    ['endurance', 'free'],
    'moderate',
    { min: 2, max: 4 },
    [
      'warmup:',
      '  300 free easy',
      '  4x50 free build 1-4 @ base+25',
      '',
      'drill:',
      '  4x75 free drill @ base+30',
      '',
      'main:',
      '  {reps:4-8}x100 free @ base+15',
      '  100 choice easy',
      '  {reps:2-4}x200 free @ base+20',
      '',
      'cooldown:',
      '  200 choice easy',
    ],
  ),
  arrangement(
    '1b6e2c3d-8c75-4f29-8d41-2a3b5c7d9e02',
    'Sprint and IM',
    ['sprint', 'im'],
    'hard',
    { min: 3, max: 5 },
    [
      'warmup:',
      '  400 choice easy',
      '  4x50 free descend 1-4 @ base+20',
      '',
      'main:',
      '  8x25 free sprint @ 0:45    # full rest, all out',
      '  {reps:2-4}x100 IM @ base+30',
      '  4x50 free hard @ base+5',
      '',
      'cooldown:',
      '  200 choice easy',
    ],
  ),
  arrangement(
    '2c7f3d4e-9d86-4a3a-9e52-3b4c6d8e0f03',
    'Stroke technique',
    ['drill', 'technique'],
    'easy',
    { min: 1, max: 4 },
    [
      'warmup:',
      '  200 choice easy',
      '',
      'drill:',
      '  4x50 kick with board @ base+40',
      '  4x50 pull with a pull buoy @ base+20',
      '  4x25 corkscrew    # alternate direction every 5 strokes',
      '',
      'main:',
      '  {reps:4-6}x50 back @ base+20',
      '  {reps:4-6}x50 breast @ base+20',
      '',
      'cooldown:',
      '  1:00 sculling',
      '  150 choice easy',
    ],
  ),
  arrangement(
    '3d8a4e5f-0e97-4b4b-8f63-4c5d7e9f1a04',
    'Toys and games',
    ['fun', 'drill', 'youth'],
    'easy',
    { min: 1, max: 3 },
    [
      'warmup:',
      '  200 choice easy',
      '',
      'main:',
      '  4x50 kick with board @ base+40',
      '  4x25 free with fins @ base+20',
      '  {reps:2-4}x25 underwater dolphin    # no breath past the flags',
      '  4x25 relay    # with a partner if there is one',
      '',
      'cooldown:',
      '  2x1:00 tread water',
      '  100 choice easy',
      '  1:00 back float    # look at the ceiling',
    ],
  ),
  arrangement(
    '4e9b5f6a-1f08-4c5c-9a74-5d6e8f0a2b05',
    'Easy return',
    ['recovery', 'free'],
    'easy',
    { min: 1, max: 5 },
    [
      'warmup:',
      '  200 free easy',
      '',
      'main:',
      '  {reps:3-6}x100 free @ base+25',
      '  4x50 choice easy @ base+30',
      '',
      'cooldown:',
      '  100 choice easy',
    ],
  ),
]
