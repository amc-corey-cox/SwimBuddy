/**
 * Closes the gaps between the generated JSON Schema and the generated types.
 *
 * Both come from schema/swimbuddy.yaml, and the point of generating them together
 * is that they agree. Two things stop them agreeing on their own:
 *
 *  - LinkML writes an optional slot as `["string", "null"]`, so the JSON Schema
 *    accepts an explicit null where the TypeScript — which uses absence
 *    throughout, under `exactOptionalPropertyTypes` — does not. An import file
 *    would validate and then fail to type-check against its own model.
 *  - LinkML has no way to say "a multiple of 25". The spec's distances rule is
 *    exactly that, and `minimum: 1` alone lets a 37 through.
 */

/** @param {Record<string, any>} node @param {(obj: Record<string, any>) => void} visit */
function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  if (node === null || typeof node !== 'object') return

  visit(node)
  for (const value of Object.values(node)) walk(value, visit)
}

/**
 * Removes the null branch from every optional.
 *
 * @param {Record<string, any>} schema mutated in place
 */
export function dropNullBranches(schema) {
  walk(schema, (node) => {
    if (Array.isArray(node.type) && node.type.includes('null')) {
      const real = node.type.filter((/** @type {string} */ name) => name !== 'null')
      // A slot whose only type was null would be a modelling mistake, not
      // something to quietly rewrite, so it is left exactly as it is.
      if (real.length === 1) node.type = real[0]
      else if (real.length > 1) node.type = real
    }

    if (Array.isArray(node.anyOf)) {
      const real = node.anyOf.filter(
        (/** @type {any} */ branch) =>
          !(branch?.type === 'null' && Object.keys(branch).length === 1),
      )
      if (real.length > 0) node.anyOf = real
    }
  })

  return schema
}

/**
 * Number constraints LinkML cannot express, by the definition and property they
 * belong to.
 *
 * One entry, and it is a rule the spec states outright: distances are multiples
 * of 25 because that is how long a pool is. Kept here rather than in the schema
 * only because there is nowhere in LinkML to put it.
 */
const MULTIPLES = /** @type {const} */ ([['Distance', 'value', 25]])

/** @param {Record<string, any>} schema mutated in place */
export function applyMultiples(schema) {
  for (const [definition, property, multiple] of MULTIPLES) {
    const target = schema.$defs?.[definition]?.properties?.[property]
    if (target === undefined) {
      throw new Error(`Cannot constrain ${definition}.${property}: it is not in the schema`)
    }
    target.multipleOf = multiple
  }

  return schema
}
