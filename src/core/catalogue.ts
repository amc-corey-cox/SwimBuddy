import type { Term } from './types'

/**
 * The shipped content of a catalogue, before it is a record.
 *
 * A catalogue entry carries the same sync envelope as everything else once it is
 * stored, but the entries in this directory are the *content* — what Swim Buddy
 * ships with. Writing three bookkeeping fields onto forty literals would bury the
 * rows that matter, so the literals stay bare and `shipped` stamps them.
 */
export type CatalogueContent<T extends Term> = Omit<T, 'created_at' | 'updated_at' | 'deleted'>

/**
 * When the shipped catalogues were authored.
 *
 * A fixed constant, not `Date.now()`: the catalogue is the same data on every
 * phone, and a timestamp that varied per install would make two devices disagree
 * about rows neither of them changed.
 */
export const CATALOGUE_SHIPPED_AT = Date.UTC(2026, 0, 1)

/** Stamps shipped content as a record. */
export function shipped<T extends Term>(content: CatalogueContent<T>): T {
  return {
    ...content,
    created_at: CATALOGUE_SHIPPED_AT,
    updated_at: CATALOGUE_SHIPPED_AT,
    deleted: false,
  } as T
}
