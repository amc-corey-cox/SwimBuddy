import type { Term } from './types'

/**
 * Alias matching, shared by every catalogue the parser reads words from.
 *
 * Activities, equipment, effort bands, patterns and structures are all the same
 * problem: a stable id, a display name, and the words a template author might
 * actually write. Matching them once here keeps a bug fixed in one place rather
 * than four, and keeps every catalogue matched by the same rules.
 */

/** A catalogue flattened to (alias, term) pairs, longest alias first. */
export type AliasIndex<T extends Term> = readonly (readonly [string, T])[]

export interface TermMatch<T extends Term> {
  readonly term: T
  /** Where in the descriptor the alias matched, so a caller can read what follows. */
  readonly index: number
  readonly length: number
}

/**
 * Longest alias first, so "underwater dolphin" wins over "dolphin kick", "back
 * float" is never matched as "back", and "pull buoy" is not read as a bare buoy.
 */
export function byAliasLength<T extends Term>(terms: readonly T[]): AliasIndex<T> {
  return terms
    .flatMap((term) => term.aliases.map((alias) => [alias.trim().toLowerCase(), term] as const))
    .sort((a, b) => b[0].length - a[0].length)
}

export function termById<T extends Term>(id: string, terms: readonly T[]): T | undefined {
  return terms.find((term) => term.id === id)
}

/**
 * The single best term a descriptor names, searching longest alias first.
 *
 * Deliberately matches anywhere in the descriptor rather than only at the front:
 * "kick with board" and "easy free" both name an activity, and the modifiers sit
 * on either side of it.
 */
export function matchTerm<T extends Term>(
  descriptor: string,
  catalogue: AliasIndex<T>,
): TermMatch<T> | undefined {
  const text = descriptor.toLowerCase()
  for (const [alias, term] of catalogue) {
    const hit = aliasPattern(alias).exec(text)
    if (hit) return { term, index: hit.index, length: hit[0].length }
  }
  return undefined
}

/**
 * Every distinct term a descriptor names, in the order they appear in it.
 *
 * Equipment is the reason this exists: "with fins and paddles" is two pieces of
 * kit, not a contest between them. Longer aliases claim their span first, so
 * "pull buoy" is one match rather than a buoy plus whatever else overlaps it.
 */
export function matchTerms<T extends Term>(
  descriptor: string,
  catalogue: AliasIndex<T>,
): readonly TermMatch<T>[] {
  const text = descriptor.toLowerCase()
  const found: TermMatch<T>[] = []
  const seen = new Set<string>()

  for (const [alias, term] of catalogue) {
    if (seen.has(term.id)) continue

    for (const hit of text.matchAll(aliasPattern(alias))) {
      const index = hit.index
      const length = hit[0].length
      if (
        found.some((claim) => index < claim.index + claim.length && index + length > claim.index)
      ) {
        continue
      }

      found.push({ term, index, length })
      seen.add(term.id)
      break
    }
  }

  return found.sort((a, b) => a.index - b.index)
}

/**
 * Word-bounded and case-insensitive, so "carefree" never names freestyle.
 *
 * The alias is normalised, not just the descriptor. These catalogues become
 * records a swimmer can add, so an alias typed as "IM" or with a stray space
 * around it has to match all the same — lowercasing only one side would leave
 * such a row silently unmatchable, which is the worst way for it to fail.
 */
function aliasPattern(alias: string): RegExp {
  const normalised = alias.trim().toLowerCase()
  return new RegExp(`\\b${normalised.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
}
