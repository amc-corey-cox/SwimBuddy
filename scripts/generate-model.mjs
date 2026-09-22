#!/usr/bin/env node
/**
 * schema/swimbuddy.yaml -> schema/swimbuddy.schema.json + src/core/model.ts
 *
 * Run with `npm run schema:gen`, after `npm run schema:setup` has built the
 * toolchain once. Both outputs are committed, so nothing in CI, the app build or a
 * test run needs Python — development happens on a phone, and a 200MB toolchain is
 * not something to put in the way of `npm test`.
 *
 * The TypeScript comes from `gen-typescript` and the JSON Schema from
 * `gen-json-schema`. They are separate generators over the same schema rather than
 * one derived from the other: routing types through JSON Schema means inheriting
 * its bugs, and loses `extends` and per-property documentation on the way.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { nonEmptyListsOf, unionsOf } from './schema-shapes.mjs'
import { hardenGeneratedTypes } from './harden-generated-types.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA = join(root, 'schema', 'swimbuddy.yaml')
const JSON_SCHEMA = join(root, 'schema', 'swimbuddy.schema.json')
const TYPES = join(root, 'src', 'core', 'model.ts')

const BANNER = `/**
 * GENERATED FROM schema/swimbuddy.yaml — DO NOT EDIT.
 *
 * Regenerate with \`npm run schema:gen\`. Change the model by changing the schema;
 * an edit here is lost on the next run and, worse, makes the schema a lie.
 */
/* eslint-disable */
`

/** A schema small enough to reason about, exercising only what the patch fixes. */
const CAPABILITY_PROBE = `id: https://example.org/probe
name: probe
prefixes: {linkml: 'https://w3id.org/linkml/', probe: 'https://example.org/probe/'}
default_prefix: probe
imports: [linkml:types]
enums:
  Colour:
    permissible_values:
      red:
classes:
  Probe:
    tree_root: true
    attributes:
      colour: {range: Colour, required: true}
      pinned: {range: string, required: true, equals_string: fixed}
`

function bin(name) {
  const configured = process.env.LINKML_BIN
  const candidates = [
    ...(configured ? [join(configured, name)] : []),
    join(root, '.linkml', 'bin', name),
  ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (found === undefined) {
    throw new Error(
      `${name} not found (looked in ${candidates.join(', ')}).\n` +
        'Run `npm run schema:setup` — see schema/README.md.',
    )
  }
  return found
}

function run(name, args) {
  return execFileSync(bin(name), args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Refuses to generate against a LinkML whose gen-typescript is missing the fixes
 * in schema/patches/.
 *
 * Without them every enum-typed slot silently becomes `string` and every
 * discriminant loses its literal type. That produces a model.ts that compiles,
 * mostly works, and is wrong — the failure this checks for is the quiet kind.
 */
function assertPatched() {
  const probe = join(root, 'node_modules', '.cache', 'linkml-probe.yaml')
  mkdirSync(dirname(probe), { recursive: true })
  writeFileSync(probe, CAPABILITY_PROBE)

  const out = run('gen-typescript', [probe])
  const missing = [
    ...(out.includes('colour: Colour') ? [] : ['enum ranges are typed `string`']),
    ...(out.includes("pinned: 'fixed'") ? [] : ['`equals_string` does not produce a literal type']),
  ]

  if (missing.length > 0) {
    throw new Error(
      `The installed LinkML is missing the gen-typescript fixes: ${missing.join('; ')}.\n` +
        'Run `npm run schema:setup` to apply schema/patches/. Generating without them\n' +
        'produces a model.ts that compiles and is quietly wrong.',
    )
  }
}

function main() {
  assertPatched()

  const linkml = parseYaml(readFileSync(SCHEMA, 'utf8'))

  const schema = JSON.parse(run('gen-json-schema', [SCHEMA]))
  // LinkML closes every class in $defs but leaves the tree root open, so the same
  // StoreSnapshot is strict in one place and permissive in the other. An export file
  // carrying fields we do not know is a version mismatch or a hand edit, and either
  // is worth refusing rather than silently dropping.
  schema.additionalProperties = false

  mkdirSync(dirname(JSON_SCHEMA), { recursive: true })
  writeFileSync(JSON_SCHEMA, `${JSON.stringify(schema, null, 2)}\n`)

  const shapes = { unions: unionsOf(linkml), nonEmptyLists: nonEmptyListsOf(linkml) }
  const types = hardenGeneratedTypes(run('gen-typescript', [SCHEMA]), shapes)
  writeFileSync(TYPES, `${BANNER}\n${types.trim()}\n`)

  const rel = (path) => path.replace(`${root}/`, '')
  console.log(`wrote ${rel(JSON_SCHEMA)} and ${rel(TYPES)}`)
  console.log(`unions: ${[...shapes.unions.keys()].join(', ')}`)
}

main()
