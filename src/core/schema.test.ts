import { describe, expect, it } from 'vitest'
import Ajv2019 from 'ajv/dist/2019'
import jsonSchema from '../../schema/swimbuddy.schema.json'
import { demoStore } from '../fixtures'
import { parseTemplate } from './parser'
import { ACTIVITIES } from './activities'
import { EFFORTS, EQUIPMENT, PATTERNS, STRUCTURES } from './modifiers'

/**
 * The generated JSON Schema, used on real data.
 *
 * This is the half of the model TypeScript cannot check: `Distance` says a value
 * is a positive multiple of 25 and `Duration` says it has no `value` field, and
 * nothing at compile time stops a hand-written fixture — or an imported file a
 * swimmer got from somewhere — from breaking either. The schema does, and it is
 * generated from the same source as the types, so the two cannot disagree.
 */
const ajv = new Ajv2019({ strict: false, allErrors: true })
const validateStore = ajv.compile(jsonSchema)

function errors(data: unknown): string[] {
  validateStore(data)
  return (validateStore.errors ?? []).map((error) =>
    `${error.instancePath || '/'} ${error.message ?? ''}`.trim(),
  )
}

describe('the synthetic store', () => {
  it('validates against the generated schema', () => {
    expect(errors(demoStore())).toEqual([])
  })

  it('still validates with every template parsed into it', () => {
    // parsed_sets is the parser's output living inside a stored record, so this
    // checks the parse tree against the schema too — every extent, interval,
    // pattern and part the fixture corpus produces.
    const store = demoStore()
    const withParses = {
      ...store,
      templates: store.templates.map((template) => ({
        ...template,
        parsed_sets: parseTemplate(template.raw_text).sections,
      })),
    }

    expect(errors(withParses)).toEqual([])
  })
})

/** A store whose one parsed set carries the given distance. */
function storeWithDistance(value: number): unknown {
  const store = demoStore()
  return {
    ...store,
    templates: [
      {
        ...store.templates[0],
        parsed_sets: [
          {
            name: 'main',
            lines: [
              {
                kind: 'set',
                reps: 1,
                raw: `${String(value)} free`,
                parts: [{ extent: { kind: 'distance', value }, descriptor: 'free' }],
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('the schema rejects what the types cannot', () => {
  it('rejects a distance that is not positive', () => {
    const store = demoStore()
    const broken = {
      ...store,
      templates: [
        {
          ...store.templates[0],
          parsed_sets: [
            {
              name: 'main',
              lines: [
                {
                  kind: 'set',
                  reps: 1,
                  raw: '0 free',
                  parts: [{ extent: { kind: 'distance', value: 0 }, descriptor: 'free' }],
                },
              ],
            },
          ],
        },
      ],
    }

    expect(errors(broken)).not.toEqual([])
  })

  it('rejects an extent that claims a distance and a duration at once', () => {
    const store = demoStore()
    const broken = {
      ...store,
      templates: [
        {
          ...store.templates[0],
          parsed_sets: [
            {
              name: 'main',
              lines: [
                {
                  kind: 'set',
                  reps: 1,
                  raw: '100 free',
                  parts: [
                    {
                      extent: { kind: 'distance', value: 100, seconds: 60 },
                      descriptor: 'free',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    expect(errors(broken)).not.toEqual([])
  })

  it('rejects a swimmer whose load factor is outside the clamp', () => {
    const store = demoStore()
    const first = store.swimmers[0]
    if (first === undefined) throw new Error('fixtures have no swimmers')

    expect(errors({ ...store, swimmers: [{ ...first, load_factor: 2.5 }] })).not.toEqual([])
  })

  it('rejects a distance that is not a whole pool length', () => {
    // The spec's distances rule. LinkML has no way to say "a multiple of 25", so
    // without the generator applying it a 37 would validate against a schema that
    // the TypeScript model and the resolver both consider impossible.
    expect(errors(storeWithDistance(37))).not.toEqual([])
    expect(errors(storeWithDistance(100))).toEqual([])
  })

  it('rejects an explicit null where the model means absent', () => {
    // The two artifacts are generated from one schema and have to agree: the
    // TypeScript uses absence under exactOptionalPropertyTypes, so a JSON Schema
    // that accepted null would validate a file the model cannot hold.
    const store = demoStore()
    const withNull = {
      ...store,
      sessions: [{ ...store.sessions[0], notes: null }],
    }

    expect(errors(withNull)).not.toEqual([])
  })

  it('rejects an unknown field, because the export file is a closed shape', () => {
    expect(errors({ ...demoStore(), surprise: true })).not.toEqual([])
  })

  it('rejects a store missing a required collection', () => {
    const withoutTestSets: Record<string, unknown> = { ...demoStore() }
    delete withoutTestSets['test_sets']

    expect(errors(withoutTestSets)).not.toEqual([])
  })
})

describe('the shipped catalogues', () => {
  // The catalogues are seeded into storage in step 4, so they are not part of the
  // store snapshot yet. Validating them against their own definitions now means
  // that step starts from data already known to fit.
  it.each([
    ['Activity', ACTIVITIES],
    ['Equipment', EQUIPMENT],
    ['EffortBand', EFFORTS],
    ['Pattern', PATTERNS],
    ['Structure', STRUCTURES],
  ])('every %s row validates', (definition, rows) => {
    const validate = ajv.compile({ $ref: `#/$defs/${definition}`, $defs: jsonSchema.$defs })

    for (const row of rows) {
      expect({ row: row.id, valid: validate(row), errors: validate.errors }).toEqual({
        row: row.id,
        valid: true,
        errors: null,
      })
    }
  })
})
