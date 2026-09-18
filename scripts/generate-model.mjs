#!/usr/bin/env node
/**
 * schema/swimbuddy.yaml -> schema/swimbuddy.schema.json + src/core/model.ts
 *
 * Run with `npm run schema:gen`. Both outputs are committed, so nothing in CI, the
 * app build or a test run needs Python — development happens on a phone, and a
 * 200MB toolchain is not something to put in the way of `npm test`.
 *
 * LINKML_BIN points at the directory holding gen-json-schema; see schema/README.md
 * for the one-time setup.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { compile } from 'json-schema-to-typescript'
import { hoistUnions, stripRefSiblings, unionsOf } from './hoist-schema-unions.mjs'
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

function linkmlBin() {
  const configured = process.env.LINKML_BIN
  const candidates = [
    ...(configured ? [join(configured, 'gen-json-schema')] : []),
    join(root, '.linkml', 'bin', 'gen-json-schema'),
  ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (found === undefined) {
    throw new Error(
      `gen-json-schema not found (looked in ${candidates.join(', ')}).\n` +
        'See schema/README.md — it is a Python tool and is not an npm dependency.',
    )
  }
  return found
}

function main() {
  const linkml = parseYaml(readFileSync(SCHEMA, 'utf8'))

  const raw = JSON.parse(
    execFileSync(linkmlBin(), [SCHEMA], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  )
  const unions = unionsOf(linkml)
  const schema = stripRefSiblings(hoistUnions(raw, unions))

  // LinkML closes every class in $defs but leaves the tree root open, so the same
  // StoreSnapshot is strict in one place and permissive in the other. An export file
  // carrying fields we do not know is a version mismatch or a hand edit, and either
  // is worth refusing rather than silently dropping.
  schema.additionalProperties = false

  mkdirSync(dirname(JSON_SCHEMA), { recursive: true })
  writeFileSync(JSON_SCHEMA, `${JSON.stringify(schema, null, 2)}\n`)

  // The tree root is inlined at the top level of the JSON Schema *and* present in
  // $defs, so compiling it as-is yields StoreSnapshot twice. Drop the $defs copy and
  // let the root be it. The schema written to disk keeps both, which is what lets it
  // validate an export file directly.
  const defs = { ...schema.$defs }
  delete defs.StoreSnapshot
  // The root's own title is what the generator names it after, not the argument.
  const forTypes = { ...schema, title: 'StoreSnapshot', $defs: defs }

  return compile(forTypes, 'StoreSnapshot', {
    bannerComment: '',
    additionalProperties: false,
    unreachableDefinitions: true,
    declareExternallyReferenced: true,
    enableConstEnums: false,
    style: { semi: false, singleQuote: true, printWidth: 100 },
  }).then((ts) => {
    writeFileSync(TYPES, `${BANNER}\n${hardenGeneratedTypes(ts).trim()}\n`)
    console.log(`wrote ${JSON_SCHEMA.replace(`${root}/`, '')} and ${TYPES.replace(`${root}/`, '')}`)
    console.log(`named unions: ${[...unions.keys()].join(', ')}`)
  })
}

await main()
