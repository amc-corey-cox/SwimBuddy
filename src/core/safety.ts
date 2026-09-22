import type { Swimmer } from './types'

/**
 * The hard caps from docs/spec.md, in one place.
 *
 * Two of these numbers — the youth distance cap and both rest minimums — were not
 * in the spec before the resolver needed them. They are documented there now and
 * are awaiting the author's sign-off; this is the only file to change if they move.
 *
 * The load factor bounds were already specified: 0.6–1.4 for everyone, with youth
 * capped at 1.15.
 */
export interface SafetyCaps {
  /** Resolved session distance, in pool units. Null where there is no cap. */
  readonly max_session_distance: number | null
  readonly max_load_factor: number
  readonly min_load_factor: number
  /**
   * Seconds of rest a send-off must leave beyond a realistic swim time for the
   * extent. A send-off tighter than this is widened rather than prescribed.
   */
  readonly min_rest_seconds: number
}

export const YOUTH_CAPS: SafetyCaps = {
  max_session_distance: 1500,
  max_load_factor: 1.15,
  min_load_factor: 0.6,
  min_rest_seconds: 15,
}

export const ADULT_CAPS: SafetyCaps = {
  max_session_distance: null,
  max_load_factor: 1.4,
  min_load_factor: 0.6,
  min_rest_seconds: 5,
}

export function capsFor(swimmer: Pick<Swimmer, 'is_youth'>): SafetyCaps {
  return swimmer.is_youth ? YOUTH_CAPS : ADULT_CAPS
}

/** Clamps a load factor into the bounds that apply to this swimmer. */
export function clampLoadFactor(loadFactor: number, caps: SafetyCaps): number {
  return Math.min(Math.max(loadFactor, caps.min_load_factor), caps.max_load_factor)
}
