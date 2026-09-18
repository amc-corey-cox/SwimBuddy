import type { Activity } from './types'

/**
 * The shipped activity catalogue, from docs/spec.md.
 *
 * Examples chosen to prove the shape stretches to what a swimmer actually does,
 * not a library. Adding an activity is a row here — and, once step 4 seeds these
 * into storage, a record a swimmer can add without a release.
 *
 * `aliases` are the words a template author might write. The parser matches on
 * them; the `id` is what everything downstream reasons about.
 */
export const ACTIVITIES: readonly Activity[] = [
  {
    id: 'free',
    name: 'Freestyle',
    paced: true,
    stroke_group: 'free',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['free', 'freestyle', 'fr'],
  },
  {
    id: 'back',
    name: 'Backstroke',
    paced: true,
    stroke_group: 'back',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['back', 'backstroke', 'bk'],
  },
  {
    id: 'breast',
    name: 'Breaststroke',
    paced: true,
    stroke_group: 'breast',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['breast', 'breaststroke', 'br'],
  },
  {
    id: 'fly',
    name: 'Butterfly',
    paced: true,
    stroke_group: 'fly',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['fly', 'butterfly', 'fl'],
  },
  {
    id: 'im',
    name: 'Individual medley',
    paced: true,
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['im', 'individual medley', 'medley'],
  },
  {
    id: 'choice',
    name: 'Choice',
    paced: true,
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['choice', 'swim'],
  },
  {
    id: 'kick',
    name: 'Kick',
    paced: true,
    mode: 'kick',
    extent_kind: 'distance',
    aliases: ['kick'],
  },
  {
    id: 'pull',
    name: 'Pull',
    paced: true,
    mode: 'pull',
    extent_kind: 'distance',
    aliases: ['pull'],
  },
  {
    id: 'drill',
    name: 'Drill',
    paced: true,
    mode: 'drill',
    extent_kind: 'distance',
    aliases: ['drill'],
  },
  {
    id: 'corkscrew',
    name: 'Corkscrew',
    paced: true,
    stroke_group: 'free',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['corkscrew'],
  },
  {
    id: 'underwater_dolphin',
    name: 'Underwater dolphin',
    paced: false,
    extent_kind: 'distance',
    aliases: ['underwater dolphin', 'underwater', 'dolphin kick'],
  },
  {
    id: 'sculling',
    name: 'Sculling',
    paced: false,
    extent_kind: 'either',
    aliases: ['sculling', 'scull'],
  },
  {
    id: 'tread_water',
    name: 'Treading water',
    paced: false,
    extent_kind: 'time',
    aliases: ['tread water', 'treading water', 'tread'],
  },
  {
    id: 'back_float',
    name: 'Back float',
    paced: false,
    extent_kind: 'time',
    aliases: ['back float', 'float on your back', 'float'],
  },
]

/**
 * Aliases longest first, so "underwater dolphin" wins over "dolphin kick" and
 * "back float" is never matched as "back".
 */
const BY_ALIAS_LENGTH: readonly (readonly [string, Activity])[] = ACTIVITIES.flatMap((activity) =>
  activity.aliases.map((alias) => [alias, activity] as const),
).sort((a, b) => b[0].length - a[0].length)

export function activityById(id: string): Activity | undefined {
  return ACTIVITIES.find((activity) => activity.id === id)
}

/**
 * Finds the activity a descriptor names, searching longest alias first.
 *
 * Deliberately matches anywhere in the descriptor rather than only at the front:
 * "kick with board" and "easy free" both name an activity, and the modifiers sit
 * on either side of it.
 */
export function recogniseActivity(
  descriptor: string,
  catalogue: readonly (readonly [string, Activity])[] = BY_ALIAS_LENGTH,
): Activity | undefined {
  const text = descriptor.toLowerCase()
  for (const [alias, activity] of catalogue) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) {
      return activity
    }
  }
  return undefined
}
