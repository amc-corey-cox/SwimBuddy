# The schema

`swimbuddy.yaml` is a [LinkML](https://linkml.io/) schema and it is the source of
truth for the data model. Two files are generated from it and committed:

- `swimbuddy.schema.json` — JSON Schema, from `gen-json-schema`, used to validate an
  import file and the fixture store.
- `../src/core/model.ts` — the TypeScript types the app is written against, from
  `gen-typescript`.

They are two generators over the same schema, not one derived from the other.
Generating types out of the JSON Schema means inheriting its bugs, and loses
`extends` and the per-property documentation on the way.

Neither is edited by hand. Change the model by changing the schema.

## Regenerating

```
npm run schema:setup   # once per sandbox
npm run schema:gen
```

LinkML is a Python tool and is deliberately not an npm dependency: development
happens on a phone, and nothing in CI, the app build or `npm test` should need a
200MB toolchain to run. The committed output is what everything else reads.

`schema:setup` builds `.linkml/` and applies everything in `patches/`. It is
idempotent. `.linkml/` is gitignored; point `LINKML_BIN` at another install if you
keep one elsewhere, and `LINKML_VENV` to build it somewhere else.

## The patches

`gen-typescript` in released LinkML types every enum-ranged slot as `string`,
ignores `equals_string`, and ignores `any_of` — so enums come out emitted but
unreferenced, and discriminated unions are not expressible. `patches/` carries the
fix; it has been sent upstream and these files go away when it lands.

`schema:gen` refuses to run against an unpatched LinkML. That check exists because
the failure is the quiet kind: the output still compiles and mostly works, it is
just wrong about every enum.

## Why the schema is written the way it is

Three things in here look odd and are load-bearing. Each was arrived at by
generating the output and reading it.

**No `default_range`, and no `range` on a slot with `any_of`.** Two versions of one
trap. An implicit string range emits `"type": "string"` beside a union's `anyOf`,
generating `(A | B) & string` — quietly `never`. Naming the abstract parent as the
range emits `{"$ref": parent, "anyOf": [...]}`, and since both apply and the parent
is an empty closed object, _nothing validates_. A slot with `any_of` names no range
at all; the alternatives are the range.

**Unions are an abstract parent with `is_a` children.** `Extent`, `Interval` and
`ParsedLine` are each an empty abstract class whose children pin a `kind` with
`equals_string`. That is what survives generation as a real TypeScript
discriminated union, so `{kind: 'distance', seconds: 60}` will not type-check and
will not validate. A single class with optional fields would allow both.

**`minimum_cardinality: 1` where a list must not be empty.** It becomes `minItems`
in JSON Schema and a non-empty tuple in TypeScript, which is what lets
`pattern.scopes[0]` be a `PatternScope` rather than possibly undefined.

## What generation cannot carry

`scripts/harden-generated-types.mjs` applies four rules to the generated
TypeScript, each closing a gap between what the schema means and what
`gen-typescript` can currently say. All four are unit tested.

`export enum` becomes a string-literal union, because TypeScript string enums are
nominal — `stroke_group: 'free'` does not type-check against one, and every fixture
here writes the string. A union also emits no runtime JavaScript, which matters for
a PWA and is required under `--erasableSyntaxOnly`.

An abstract parent standing for a union becomes a union alias and its children stop
extending it, since an empty `ParsedLine` interface has no `kind` to narrow on.
Properties become `readonly`. A list the schema says may not be empty becomes a
non-empty tuple, so `scopes[0]` is a value rather than possibly undefined.

The first two would be reasonable options upstream. The other two are this
codebase's house style rather than anything LinkML got wrong.

`scripts/tighten-json-schema.mjs` does the same job for the JSON Schema, and for
the same reason: the two artifacts are generated from one schema and are only
worth having if they agree. LinkML writes an optional slot as `["string", "null"]`,
so without this the schema would accept an explicit null that the TypeScript —
which uses absence throughout — cannot hold, and an import would validate and then
fail to type-check against its own model. It also applies the spec's "distances are
multiples of 25" rule, which LinkML has no way to express: `minimum_value` alone
lets a 37 through.
