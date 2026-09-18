# The schema

`swimbuddy.yaml` is a [LinkML](https://linkml.io/) schema and it is the source of
truth for the data model. Two files are generated from it and committed:

- `swimbuddy.schema.json` — JSON Schema, used to validate an import file and the
  fixture store.
- `../src/core/model.ts` — the TypeScript types the app is written against.

Neither is edited by hand. Change the model by changing the schema.

## Regenerating

```
npm run schema:gen
```

LinkML is a Python tool and is deliberately not an npm dependency: development
happens on a phone, and nothing in CI, the app build or `npm test` should need a
200MB toolchain to run. The committed output is what everything else reads.

One-time setup, in a sandbox that has Python:

```
python3 -m venv .linkml
.linkml/bin/pip install linkml
```

`.linkml/` is gitignored. Point `LINKML_BIN` at another install if you keep one
elsewhere.

## Why the schema is written the way it is

Three things in here look odd and are load-bearing. Each was arrived at by
generating the output and reading it.

**No `default_range`.** An implicit string range emits `"type": "string"` alongside
a union's `anyOf`, which generates `(A | B) & string` — quietly `never`. Every slot
names its own range, and a slot with `any_of` names none at all.

**Unions are an abstract parent with `is_a` children.** `Extent`, `Interval` and
`ParsedLine` are each an empty abstract class whose children pin a `kind` with
`equals_string`. That is what survives generation as a real TypeScript
discriminated union, so `{kind: 'distance', seconds: 60}` will not type-check and
will not validate. A single class with optional fields would allow both.

**`minimum_cardinality: 1` where a list must not be empty.** It becomes `minItems`
in JSON Schema and a non-empty tuple in TypeScript, which is what lets
`pattern.scopes[0]` be a `PatternScope` rather than possibly undefined.

## What generation cannot carry

`scripts/generate-model.mjs` fixes four things up, each because JSON Schema or the
TypeScript generator cannot say what the schema means. They are documented in that
file and in `scripts/harden-generated-types.mjs`, and both are unit tested:
`readonly`, absent-rather-than-null optionals, index signatures, and naming the
unions so `Interval` stays one type rather than three copies.

A property description written next to a `$ref` is dropped from the generated types
— it would make the generator emit a duplicate type per description. The prose is
still here, in this directory, which is the file to read anyway.
