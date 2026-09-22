/**
 * Bends gen-typescript's output into the shape this codebase uses.
 *
 * Four rules, each closing a gap between what the schema means and what the
 * generator can currently say:
 *
 *  - `export enum` becomes a string-literal union. TypeScript string enums are
 *    nominal, so `stroke_group: 'free'` is an error against one — every fixture
 *    and object literal here writes the string. A union also emits no runtime
 *    JavaScript, which matters for a PWA and is required under
 *    `--erasableSyntaxOnly`.
 *  - An abstract parent standing for a union becomes a union alias, and its
 *    children stop extending it. `ParsedLine` as an empty interface has no `kind`
 *    to narrow on, which is the whole reason the parse tree is typed this way.
 *  - `readonly` on every property and array. The model is immutable.
 *  - A list the schema says may not be empty becomes a non-empty tuple, so
 *    `scopes[0]` is a value rather than possibly undefined.
 *
 *  - Continuation lines inside a doc comment get their `*` back. A description is
 *    interpolated straight into one `*` line, so the second paragraph of a
 *    multi-paragraph one lands outside the comment's left rail — still inside the
 *    block, but malformed, and one comment-terminating sequence in a description
 *    away from being a syntax error rather than an eyesore.
 *
 * What the generator now gets right by itself, and this no longer touches:
 * enum-typed slots, literal discriminants, `any_of` unions, optional properties
 * (emitted as `?` with no `| null`), and per-property doc comments.
 */

/**
 * @param {string} source
 * @param {{unions: Map<string, string[]>, nonEmptyLists: Map<string, Set<string>>}} shapes
 */
export function hardenGeneratedTypes(source, shapes) {
  const withUnions = replaceEnums(replaceUnionParents(source, shapes.unions))
  const withProperties = applyProperties(withUnions, shapes.nonEmptyLists)

  return repairDocComments(nameUnions(withProperties, shapes.unions))
}

/**
 * Gives every line inside a doc comment its `*` back.
 *
 * @param {string} source
 */
function repairDocComments(source) {
  let inside = false

  return source
    .split('\n')
    .map((line) => {
      const opens = line.includes('/**')
      const closes = line.includes('*/')

      if (opens && !closes) {
        inside = true
        return line
      }
      if (closes) {
        inside = false
        return line
      }
      if (!inside || /^\s*\*/.test(line)) return line

      return line.trim() === '' ? ' *' : ` * ${line.trim()}`
    })
    .join('\n')
}

/**
 * Puts the union's name back where the generator spelled out its members.
 *
 * `any_of` is resolved member by member, so a slot holding an Extent arrives as
 * `Distance | Duration`. That is the same type, but the name is the one the schema
 * and the rest of the codebase use, and it survives a member being added.
 *
 * @param {string} source
 * @param {Map<string, string[]>} unions
 */
function nameUnions(source, unions) {
  let out = source

  for (const [parent, children] of unions) {
    if (children.length < 2) continue

    const spelled = children.join(' | ')
    // Only inside a property, never in the alias that defines the union itself.
    out = out.replaceAll(`: ${spelled},`, `: ${parent},`)
    out = out.replaceAll(`: readonly (${spelled})[],`, `: readonly ${parent}[],`)
    out = out.replaceAll(
      `: readonly [${spelled}, ...(${spelled})[]],`,
      `: readonly [${parent}, ...${parent}[]],`,
    )
  }

  return out
}

const ENUM_BLOCK = /export enum (\w+) \{([\s\S]*?)\n\};?/g
const ENUM_MEMBER = /^\s*[\w$]+\s*=\s*"([^"]*)",?\s*$/

/** `export enum X { a = "a" }` -> `export type X = 'a'`. */
function replaceEnums(source) {
  return source.replace(ENUM_BLOCK, (whole, name, body) => {
    const values = body
      .split('\n')
      .map((line) => ENUM_MEMBER.exec(line)?.[1])
      .filter((value) => value !== undefined)

    // A member shape we do not recognise means leaving it alone is safer than
    // emitting a union that quietly omits a value.
    if (values.length === 0) return whole

    return `export type ${name} = ${values.map((value) => `'${value}'`).join(' | ')}`
  })
}

/**
 * The abstract parent becomes the union; its children drop the `extends` that
 * pointed at it, which would no longer be a valid thing to extend.
 *
 * @param {string} source
 * @param {Map<string, string[]>} unions
 */
function replaceUnionParents(source, unions) {
  let out = source

  for (const [parent, children] of unions) {
    out = out.replace(
      new RegExp(`export interface ${parent} \\{\\s*\\}`),
      `export type ${parent} = ${children.join(' | ')}`,
    )
    out = out.replace(new RegExp(`(export interface \\w+) extends ${parent} \\{`, 'g'), '$1 {')
  }

  return out
}

const INTERFACE_OPEN = /^export interface (\w+)(?: extends [\w, ]+)? \{$/
const PROPERTY = /^(\s+)(readonly\s+)?([A-Za-z_$][\w$]*)(\??):\s*(.+?),?$/

/**
 * @param {string} source
 * @param {Map<string, Set<string>>} nonEmptyLists
 */
function applyProperties(source, nonEmptyLists) {
  /** @type {string | undefined} */
  let current

  return source
    .split('\n')
    .map((line) => {
      const open = INTERFACE_OPEN.exec(line)
      if (open?.[1] !== undefined) {
        current = open[1]
        return line
      }
      if (line === '}') {
        current = undefined
        return line
      }

      return hardenProperty(line, current === undefined ? undefined : nonEmptyLists.get(current))
    })
    .join('\n')
}

/**
 * @param {string} line
 * @param {Set<string> | undefined} nonEmpty slots on this interface that may not be empty
 */
function hardenProperty(line, nonEmpty) {
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

  const type = nonEmpty?.has(name) ? nonEmptyTuple(rawType) : readonlyArrays(rawType)
  return `${indent}readonly ${name}${optional}: ${type},`
}

/** `T[]` -> `readonly [T, ...T[]]`, keeping the element type whole if it is a union. */
function nonEmptyTuple(type) {
  const element = /^\((.+)\)\[\]$/.exec(type)?.[1] ?? /^(.+)\[\]$/.exec(type)?.[1]
  if (element === undefined) return readonlyArrays(type)

  return `readonly [${element}, ...${element}[]]`
}

/** `T[]` -> `readonly T[]`, including inside a union. */
function readonlyArrays(type) {
  return type.replace(/(\([^()]*\)|[\w$.]+)\[\]/g, (whole) =>
    whole.startsWith('readonly ') ? whole : `readonly ${whole}`,
  )
}
