import type { Settings, StoreSnapshot } from '../core/types'
import { SCHEMA_VERSION } from '../core/types'
import { ACTIVITIES } from '../core/activities'
import { EFFORTS, EQUIPMENT, PATTERNS, STRUCTURES } from '../core/modifiers'
import { FIXTURE_REFERENCE_DATE, daysBefore } from './constants'
import { demoSwimmers } from './swimmers'
import { demoTemplates } from './templates'
import { demoSessions } from './sessions'
import { demoTestSets } from './testSets'

export { FIXTURE_REFERENCE_DATE, DAY_MS, daysBefore } from './constants'
export { demoSwimmers, SWIMMER_IDS } from './swimmers'
export { demoTemplates, TEMPLATE_IDS } from './templates'
export { demoSessions } from './sessions'
export { demoTestSets } from './testSets'

export function demoSettings(referenceDate: number = FIXTURE_REFERENCE_DATE): Settings {
  const created = daysBefore(referenceDate, 120)
  return {
    id: 'f6a7b8c9-d0e1-4f2a-9b4c-5d6e7f809102',
    created_at: created,
    updated_at: created,
    deleted: false,
    pool_unit: 'yards',
    pool_length: 25,
  }
}

/**
 * The whole synthetic store, in the same shape as the JSON export file.
 *
 * Pure and deterministic: pass a reference date and you get identical records
 * every time. Tests pass the fixed `FIXTURE_REFERENCE_DATE`; the preview build
 * passes the current time so the demo history reads as recent.
 */
export function demoStore(referenceDate: number = FIXTURE_REFERENCE_DATE): StoreSnapshot {
  return {
    version: SCHEMA_VERSION,
    swimmers: demoSwimmers(referenceDate),
    templates: demoTemplates(referenceDate),
    sessions: demoSessions(referenceDate),
    test_sets: demoTestSets(referenceDate),
    settings: demoSettings(referenceDate),
    // The shipped catalogues, not synthetic ones: a demo store that referred to
    // activities nobody has would not exercise the thing it is standing in for.
    activities: ACTIVITIES,
    equipment: EQUIPMENT,
    effort_bands: EFFORTS,
    patterns: PATTERNS,
    structures: STRUCTURES,
  }
}
