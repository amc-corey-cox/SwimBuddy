import { shipped } from './catalogue'
import { byAliasLength, matchTerm, termById, type AliasIndex } from './terms'
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
  shipped({
    id: 'free',
    name: 'Freestyle',
    paced: true,
    stroke_group: 'free',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['free', 'freestyle', 'fr'],
  }),
  shipped({
    id: 'back',
    name: 'Backstroke',
    paced: true,
    stroke_group: 'back',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['back', 'backstroke', 'bk'],
  }),
  shipped({
    id: 'breast',
    name: 'Breaststroke',
    paced: true,
    stroke_group: 'breast',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['breast', 'breaststroke', 'br'],
  }),
  shipped({
    id: 'fly',
    name: 'Butterfly',
    paced: true,
    stroke_group: 'fly',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['fly', 'butterfly', 'fl'],
  }),
  shipped({
    id: 'im',
    name: 'Individual medley',
    paced: true,
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['im', 'individual medley', 'medley'],
  }),
  shipped({
    id: 'choice',
    name: 'Choice',
    paced: true,
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['choice', 'swim'],
  }),
  shipped({
    id: 'kick',
    name: 'Kick',
    paced: true,
    mode: 'kick',
    extent_kind: 'distance',
    aliases: ['kick'],
  }),
  shipped({
    id: 'pull',
    name: 'Pull',
    paced: true,
    mode: 'pull',
    extent_kind: 'distance',
    aliases: ['pull'],
  }),
  shipped({
    id: 'drill',
    name: 'Drill',
    paced: true,
    mode: 'drill',
    extent_kind: 'distance',
    aliases: ['drill'],
  }),
  shipped({
    id: 'corkscrew',
    name: 'Corkscrew',
    paced: true,
    stroke_group: 'free',
    mode: 'swim',
    extent_kind: 'distance',
    aliases: ['corkscrew'],
  }),
  shipped({
    id: 'underwater_dolphin',
    name: 'Underwater dolphin',
    paced: false,
    extent_kind: 'distance',
    aliases: ['underwater dolphin', 'underwater', 'dolphin kick'],
  }),
  shipped({
    id: 'sculling',
    name: 'Sculling',
    paced: false,
    extent_kind: 'either',
    aliases: ['sculling', 'scull'],
  }),
  shipped({
    id: 'tread_water',
    name: 'Treading water',
    paced: false,
    extent_kind: 'time',
    aliases: ['tread water', 'treading water', 'tread'],
  }),
  shipped({
    id: 'back_float',
    name: 'Back float',
    paced: false,
    extent_kind: 'time',
    aliases: ['back float', 'float on your back', 'float'],
  }),
]

const BY_ALIAS_LENGTH = byAliasLength(ACTIVITIES)

export function activityById(id: string): Activity | undefined {
  return termById(id, ACTIVITIES)
}

/** Finds the activity a descriptor names, searching longest alias first. */
export function recogniseActivity(
  descriptor: string,
  catalogue: AliasIndex<Activity> = BY_ALIAS_LENGTH,
): Activity | undefined {
  return matchTerm(descriptor, catalogue)?.term
}
