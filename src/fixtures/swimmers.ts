import type { Swimmer } from '../core/types'
import { FIXTURE_REFERENCE_DATE, daysBefore } from './constants'

/**
 * Three synthetic swimmers shaped like the household in CLAUDE.md: a returning
 * ex-competitor, a fitness swimmer, and a youth swimmer. Names are invented —
 * this repository is public, so no real family data lives here.
 */
export function demoSwimmers(referenceDate: number = FIXTURE_REFERENCE_DATE): Swimmer[] {
  const created = daysBefore(referenceDate, 120)
  const meta = { created_at: created, updated_at: daysBefore(referenceDate, 2), deleted: false }

  return [
    {
      ...meta,
      id: '3f2a1c6e-5b7d-4e91-9a3c-1d8e6f0b2a47',
      name: 'Avery',
      birth_year: 1979,
      // Ex-swim-team, long out of the water: still efficient, no longer fast.
      base_pace_by_stroke: { free: 95, back: 107 },
      load_factor: 1.0,
      is_youth: false,
    },
    {
      ...meta,
      id: '8c4d2e0f-7a1b-4c3d-8e5f-2a9b7c1d3e60',
      name: 'Rowan',
      birth_year: 1982,
      base_pace_by_stroke: { free: 115 },
      load_factor: 0.95,
      is_youth: false,
    },
    {
      ...meta,
      id: '5e9b3d71-2c4f-4a86-b1d0-7f3e8c2a5b94',
      name: 'Quinn',
      birth_year: 2015,
      base_pace_by_stroke: { free: 105, breast: 125 },
      // Youth load factor is capped at 1.15 by the adaptation rules.
      load_factor: 1.05,
      is_youth: true,
    },
  ]
}

export const SWIMMER_IDS = {
  returningCompetitor: '3f2a1c6e-5b7d-4e91-9a3c-1d8e6f0b2a47',
  fitnessSwimmer: '8c4d2e0f-7a1b-4c3d-8e5f-2a9b7c1d3e60',
  youth: '5e9b3d71-2c4f-4a86-b1d0-7f3e8c2a5b94',
} as const
