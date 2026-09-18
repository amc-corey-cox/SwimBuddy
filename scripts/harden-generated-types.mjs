/**
 * Bends json-schema-to-typescript's output into the shape this codebase uses.
 *
 * Four mechanical rules, each closing a gap between what JSON Schema can say and
 * what the TypeScript here has always said:
 *
 *  - `readonly` on every property and array. The model is immutable; JSON Schema's
 *    own `readOnly` keyword is ignored by the generator, so it is applied here.
 *  - `| null` dropped from optional properties. LinkML has no notion of a slot that
 *    is absent rather than null, so every optional arrives nullable. This codebase
 *    uses absence throughout and `exactOptionalPropertyTypes` enforces it.
 *  - `[k: string]: unknown` index signatures dropped. The schema sets
 *    `additionalProperties: false`; the generator adds one to the tree root anyway.
 *  - The generator's "This interface was referenced by..." notes dropped. They are
 *    chatter about the JSON Schema, not documentation of the model.
 */

/** @param {string} source */
export function hardenGeneratedTypes(source) {
  const kept = source
    .split('\n')
    .filter((line) => !INDEX_SIGNATURE.test(line) && !CHATTER.test(line))
    .map(hardenProperty)

  return dropEmptyComments(kept).join('\n')
}

const INDEX_SIGNATURE = /^\s*\[k: string\]: unknown;?\s*$/
const CHATTER = /^\s*\*\s*(This interface was referenced by|via the `definition`)/

const COMMENT_OPEN = /^\s*\/\*\*\s*$/
const COMMENT_CLOSE = /^\s*\*\/\s*$/
const COMMENT_BLANK = /^\s*\*\s*$/

/**
 * Removes what stripping the chatter left behind: a trailing blank ` *` that used
 * to separate prose from it, and any comment with no prose left at all.
 *
 * @param {string[]} lines
 */
function dropEmptyComments(lines) {
  /** @type {string[]} */
  const out = []

  for (const line of lines) {
    const previous = out[out.length - 1]

    if (COMMENT_BLANK.test(line) && previous !== undefined && COMMENT_OPEN.test(previous)) continue
    if (COMMENT_CLOSE.test(line) && previous !== undefined && COMMENT_BLANK.test(previous)) {
      out.pop()
    }
    if (COMMENT_CLOSE.test(line) && previous !== undefined && COMMENT_OPEN.test(previous)) {
      out.pop()
      continue
    }

    out.push(line)
  }

  return out
}

/** A property line inside an interface, with or without a trailing semicolon. */
const PROPERTY = /^(\s+)(readonly\s+)?([A-Za-z_$][\w$]*)(\??):\s*(.+?);?$/

/** @param {string} line */
function hardenProperty(line) {
  const match = PROPERTY.exec(line)
  if (match === null) return line

  const [, indent, already, name, optional, rawType] = match
  if (
    already !== undefined ||
    indent === undefined ||
    name === undefined ||
    rawType === undefined
  ) {
    return line
  }

  const type = readonlyArrays(optional === '?' ? stripNull(rawType) : rawType)
  return `${indent}readonly ${name}${optional}: ${type}`
}

/**
 * Drops a trailing `| null`. Only ever applied to optional properties, where
 * absence already carries the meaning null was standing in for.
 *
 * @param {string} type
 */
function stripNull(type) {
  return type.replace(/\s*\|\s*null\s*$/, '')
}

/**
 * `T[]` becomes `readonly T[]`, including inside a union. A tuple — which is how a
 * `minimum_cardinality` list arrives — takes the `readonly` prefix instead.
 *
 * @param {string} type
 */
function readonlyArrays(type) {
  if (/^\[.*\]$/.test(type.trim())) return `readonly ${type}`

  return type.replace(/(\([^()]*\)|[\w$.]+)\[\]/g, (whole) =>
    whole.startsWith('readonly ') ? whole : `readonly ${whole}`,
  )
}
