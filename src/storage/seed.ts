import type { Swimmer, Timestamp } from '../core/types'
import type { RecordInput, SwimBuddyStore } from './store'

/**
 * The household from CLAUDE.md: two adults and one youth swimmer.
 *
 * These are placeholders meant to be edited on the Settings screen (build order
 * step 6), not real people. Names come from the spec's own Users table, and no
 * real family data belongs in a public repository.
 *
 * Base paces are provisional: a real one comes from a timed test set. Since no
 * TestSet row exists for a freshly seeded swimmer, the app can tell the
 * difference and prompt for a test rather than trusting these numbers.
 */
export interface SeedSwimmer {
  readonly name: string
  readonly age_at_seed: number
  readonly provisional_base_pace: number
  readonly is_youth: boolean
}

export const SEED_SWIMMERS: readonly SeedSwimmer[] = [
  { name: 'Me', age_at_seed: 47, provisional_base_pace: 120, is_youth: false },
  { name: 'Wife', age_at_seed: 44, provisional_base_pace: 130, is_youth: false },
  { name: 'Son', age_at_seed: 11, provisional_base_pace: 135, is_youth: true },
]

export interface SeedResult {
  /** False when the store already held swimmers, so nothing was written. */
  readonly seeded: boolean
  readonly swimmers: readonly Swimmer[]
}

export interface SeedOptions {
  /** Birth years are derived from this, so seeding stays deterministic. */
  readonly referenceDate?: Timestamp
}

/**
 * Populates an empty store with the default household and settings.
 *
 * Idempotent, and deliberately conservative: it seeds only when no swimmers
 * exist at all, tombstoned ones included. Someone who deletes every swimmer has
 * made a decision, and re-seeding would undo it behind their back.
 */
export async function seedIfEmpty(
  store: SwimBuddyStore,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const existing = await store.swimmers.list({ includeDeleted: true })
  if (existing.length > 0) {
    return { seeded: false, swimmers: existing }
  }

  const referenceDate = options.referenceDate ?? Date.now()
  const year = new Date(referenceDate).getUTCFullYear()

  const created: Swimmer[] = []
  for (const seed of SEED_SWIMMERS) {
    const input: RecordInput<Swimmer> = {
      name: seed.name,
      birth_year: year - seed.age_at_seed,
      base_pace_by_stroke: { free: seed.provisional_base_pace },
      load_factor: 1.0,
      is_youth: seed.is_youth,
    }
    created.push(await store.swimmers.create(input))
  }

  // Persist the default settings row so the store is complete after seeding.
  await store.updateSettings({})

  return { seeded: true, swimmers: created }
}
