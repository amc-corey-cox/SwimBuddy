#!/usr/bin/env node
/**
 * Asserts that synthetic data never reaches a production bundle.
 *
 * The fixtures are behind a build-time flag and should be tree-shaken out, but
 * that guarantee is easy to break by accident — an unguarded import anywhere in
 * the graph would quietly ship demo swimmers to the real app. Cheap to check,
 * so check it.
 *
 * Usage: node scripts/assert-no-fixtures-in-bundle.mjs [distDir]
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

const distDir = process.argv[2] ?? 'dist'

// String literals unique to the fixtures; minification mangles identifiers but
// leaves string contents intact.
const MARKERS = ['popsicles', 'Avery', 'Rowan', 'Quinn', 'synthetic data']

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

const offenders = []
for await (const file of walk(distDir)) {
  if (!/\.(js|css|html)$/.test(file)) continue
  const contents = await readFile(file, 'utf8')
  const found = MARKERS.filter((marker) => contents.includes(marker))
  if (found.length > 0) offenders.push({ file, found })
}

if (offenders.length > 0) {
  console.error('Fixture data leaked into the production bundle:\n')
  for (const { file, found } of offenders) {
    console.error(`  ${file} contains: ${found.join(', ')}`)
  }
  console.error(
    '\nFixtures must stay behind the VITE_SHOW_FIXTURES flag and be imported dynamically.',
  )
  process.exit(1)
}

console.log(`No fixture data in ${distDir}/ — production bundle is clean.`)
