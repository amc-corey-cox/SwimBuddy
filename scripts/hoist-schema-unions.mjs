/**
 * Names the schema's discriminated unions, in place, in the generated JSON Schema.
 *
 * LinkML writes a union slot as an inline `anyOf` of `$ref`s. That validates
 * correctly, but json-schema-to-typescript only names an `anyOf` it finds on a
 * required slot — an optional one gets inlined at every use site, so `Interval`
 * would vanish as a name and reappear as `BaseInterval | LiteralInterval` in four
 * places.
 *
 * Every union in the schema is an abstract class with `is_a` children, and LinkML
 * emits that parent as an empty `$defs` entry. So: fill the parent in with the
 * union of its children, and point each matching `anyOf` at it. The union
 * membership is read from the schema rather than restated, which is the whole
 * point of generating in the first place.
 */

/** @param {Record<string, unknown>} node @param {(obj: Record<string, any>) => void} visit */
function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  if (node === null || typeof node !== 'object') return

  visit(/** @type {Record<string, any>} */ (node))
  for (const value of Object.values(node)) walk(value, visit)
}

/**
 * @param {{classes?: Record<string, {is_a?: string, abstract?: boolean}>}} linkml
 * @returns {Map<string, string[]>} abstract class name -> its concrete children
 */
export function unionsOf(linkml) {
  const unions = new Map()
  for (const [name, definition] of Object.entries(linkml.classes ?? {})) {
    const parent = definition.is_a
    if (parent === undefined) continue
    if (!linkml.classes?.[parent]?.abstract) continue

    unions.set(parent, [...(unions.get(parent) ?? []), name])
  }
  // A parent whose children are themselves the model's records — RecordMeta, Term —
  // is shared structure, not a union. Only a parent nothing declares fields on is a
  // union, and LinkML gives those no attributes of their own.
  for (const parent of [...unions.keys()]) {
    if (Object.keys(linkml.classes?.[parent]?.attributes ?? {}).length > 0) unions.delete(parent)
  }
  return unions
}

/**
 * @param {Record<string, any>} schema the generated JSON Schema, mutated in place
 * @param {Map<string, string[]>} unions
 */
export function hoistUnions(schema, unions) {
  const defs = schema.$defs ?? {}

  /** @type {Map<string, string>} sorted child refs -> parent name */
  const byMembers = new Map(
    [...unions].map(([parent, children]) => [
      children
        .map((child) => `#/$defs/${child}`)
        .sort()
        .join('|'),
      parent,
    ]),
  )

  // Rewrite the use sites first. The parent defs are still empty objects at this
  // point, so none of them can match its own children and turn into a $ref to
  // itself — which is exactly what happens if these two steps are swapped.
  walk(schema, (node) => {
    if (!Array.isArray(node.anyOf)) return

    // A nullable union arrives as the children plus `{type: "null"}`. Optionality
    // carries the null in TypeScript, so it does not take part in matching — but
    // anything else alongside the refs means this is not the union we named.
    const refs = node.anyOf.filter((/** @type {any} */ branch) => typeof branch?.$ref === 'string')
    if (refs.length < 2) return

    const rest = node.anyOf.filter((/** @type {any} */ branch) => typeof branch?.$ref !== 'string')
    if (rest.some((/** @type {any} */ branch) => branch?.type !== 'null')) return

    const key = refs
      .map((/** @type {any} */ branch) => branch.$ref)
      .sort()
      .join('|')
    const parent = byMembers.get(key)
    if (parent === undefined) return

    delete node.anyOf
    node.$ref = `#/$defs/${parent}`
  })

  for (const [parent, children] of unions) {
    if (!(parent in defs)) continue
    // The parent arrives as an empty object type. Replace it wholesale: keeping
    // `type: object` alongside `anyOf` would intersect with each child and make
    // the union unsatisfiable.
    defs[parent] = {
      title: parent,
      ...(defs[parent].description ? { description: defs[parent].description } : {}),
      anyOf: children.map((child) => ({ $ref: `#/$defs/${child}` })),
    }
  }

  return schema
}

/**
 * Removes keys sitting beside a `$ref`.
 *
 * LinkML writes a property that points at a named type as `{$ref, description}`.
 * That is legal, and the description is good prose, but json-schema-to-typescript
 * treats every distinct sibling set as a distinct schema: `interval` and `pace`
 * both point at Interval and come back as `Interval1` and `Interval2`, and the
 * interfaces then reference the copies rather than the name.
 *
 * The prose is not lost, it just lives in schema/swimbuddy.yaml — which is the file
 * to read anyway. What the generated types keep is each type's own description.
 *
 * @param {Record<string, any>} schema mutated in place
 */
export function stripRefSiblings(schema) {
  walk(schema, (node) => {
    if (typeof node.$ref !== 'string') return

    for (const key of Object.keys(node)) {
      if (key !== '$ref') delete node[key]
    }
  })

  return schema
}
