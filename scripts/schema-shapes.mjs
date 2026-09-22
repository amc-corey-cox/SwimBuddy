/**
 * What the generated TypeScript needs to know about the schema that the
 * generated TypeScript does not say.
 *
 * `gen-typescript` emits every class as an interface, which is right for shared
 * structure and wrong for a union: an abstract `ParsedLine` comes out as an empty
 * interface its children `extends`, and an empty interface has no `kind` to narrow
 * on. It also has no notion of a list that may not be empty. Both facts are in the
 * schema, so they are read from there rather than guessed at from the output.
 */

/**
 * Abstract parents that stand for a union of their children, mapped to those
 * children.
 *
 * A parent that declares fields of its own — `RecordMeta`, `Term` — is shared
 * structure: `Swimmer` *has* an id, it is not one of two things a slot may hold.
 * Those keep their interface and their `extends`. A parent with no fields exists
 * only to name the alternatives, and becomes a union.
 *
 * @param {{classes?: Record<string, {is_a?: string, abstract?: boolean, attributes?: object}>}} linkml
 * @returns {Map<string, string[]>}
 */
export function unionsOf(linkml) {
  const classes = linkml.classes ?? {}
  const unions = new Map()

  for (const [name, definition] of Object.entries(classes)) {
    const parent = definition.is_a
    if (parent === undefined || !classes[parent]?.abstract) continue

    unions.set(parent, [...(unions.get(parent) ?? []), name])
  }

  for (const parent of [...unions.keys()]) {
    if (Object.keys(classes[parent]?.attributes ?? {}).length > 0) unions.delete(parent)
  }

  return unions
}

/**
 * Multivalued slots the schema says may not be empty, by the class declaring them.
 *
 * `minimum_cardinality: 1` reaches JSON Schema as `minItems` and validates, but
 * `gen-typescript` emits a plain array — so `pattern.scopes[0]` would be possibly
 * undefined under `noUncheckedIndexedAccess` despite the schema promising it is
 * not. The declaring class is enough: children inherit the slot through `extends`
 * and do not restate it.
 *
 * @param {{classes?: Record<string, {attributes?: Record<string, {multivalued?: boolean, minimum_cardinality?: number}>}>}} linkml
 * @returns {Map<string, Set<string>>}
 */
export function nonEmptyListsOf(linkml) {
  const required = new Map()

  for (const [name, definition] of Object.entries(linkml.classes ?? {})) {
    const slots = new Set(
      Object.entries(definition.attributes ?? {})
        .filter(([, slot]) => slot.multivalued === true && (slot.minimum_cardinality ?? 0) >= 1)
        .map(([slot]) => slot),
    )

    if (slots.size > 0) required.set(name, slots)
  }

  return required
}
