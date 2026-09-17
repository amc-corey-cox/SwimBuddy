/**
 * Fixed point in time all fixture dates are expressed against, so fixtures are
 * byte-identical on every run. Tests use this directly; the preview build passes
 * the real current time so demo history looks recent.
 */
export const FIXTURE_REFERENCE_DATE = Date.UTC(2026, 0, 15, 12, 0, 0)

export const DAY_MS = 24 * 60 * 60 * 1000

/** Fixture dates are authored as "N days before the reference date". */
export function daysBefore(referenceDate: number, days: number): number {
  return referenceDate - days * DAY_MS
}
