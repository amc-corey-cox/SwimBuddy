/**
 * GENERATED FROM schema/swimbuddy.yaml — DO NOT EDIT.
 *
 * Regenerate with `npm run schema:gen`. Change the model by changing the schema;
 * an edit here is lost on the next run and, worse, makes the schema a lie.
 */
/* eslint-disable */

/**
 * What the swimmer says afterwards. Not an effort band on a set.
 */
export type EffortRating = 'too_easy' | 'about_right' | 'too_hard'
/**
 * Youth swimmers only.
 */
export type FunRating = 'up' | 'down'
/**
 * One line of a template after parsing. Every variant keeps `raw`: unparseable lines are preserved verbatim and never lost, and keeping the original text on the parsed variants too means the workout view can always fall back to it.
 */
export type ParsedLine = SetLine | MetaLine | UnparsedLine
/**
 * `base+15`, `base-5`, `base`, or a literal clock time like `1:30`. Used both for a send-off and for a pace target, because a swimmer writes them the same way.
 */
export type Interval = BaseInterval | LiteralInterval
/**
 * How much of a thing a set part is: a distance in pool units, or a duration. Never both — "20:00 free" knows its time and not its distance, and treading water has no distance at all.
 */
export type Extent = Distance | Duration
/**
 * Where a pattern applies. `build` is the reason this exists and is two different instructions: a bare "4x50 build" shapes each repetition, starting easy and finishing fast within the 50, while "4x50 build 1-4" shapes the set, each repetition faster than the one before it. Neither expresses the other.
 */
export type PatternScope = 'within_rep' | 'across_set'
export type PoolUnit = 'yards' | 'meters'
/**
 * How hard a whole template is meant to be.
 */
export type Intensity = 'easy' | 'moderate' | 'hard'
/**
 * Which pair of swims a base pace test recorded. Adults swim a 400 and a 200, youth a 200 and a 100, and the two compute base pace differently.
 */
export type TestProtocol = '400/200' | '200/100'
/**
 * How an activity can be measured. `either` means both — sculling is swum for a distance or held for a time, and the set decides which.
 */
export type ActivityExtentKind = 'distance' | 'time' | 'either'
export type ActivityMode = 'swim' | 'kick' | 'pull' | 'drill'
export type StrokeGroup = 'free' | 'back' | 'breast' | 'fly'

/**
 * The whole store, which is also the shape of the JSON export/import file. This is the schema's tree root, so the generated JSON Schema validates an import file directly.
 */
export interface StoreSnapshot {
  readonly sessions: readonly Session[]
  readonly settings: Settings
  readonly swimmers: readonly Swimmer[]
  readonly templates: readonly Template[]
  readonly test_sets: readonly TestSet[]
  /**
   * Bumped whenever a migration is added.
   */
  readonly version: number
}
/**
 * One swim. Swims are not measured: a session records how it felt, and the adaptation rules run off that.
 */
export interface Session {
  /**
   * Whether the main set was finished. Absent until the swimmer says.
   */
  readonly completed?: boolean
  readonly created_at: number
  readonly date: number
  readonly deleted: boolean
  readonly effort_rating?: EffortRating
  readonly fun_rating?: FunRating
  readonly id: string
  readonly notes: string
  /**
   * Filled by the resolver in step 5; absent until then.
   */
  readonly resolved_sets?: readonly ParsedSection[]
  readonly swimmer_id: string
  readonly template_id: string
  /**
   * Includes the easy-swim equivalent of any time-measured sets, so one number stays comparable week to week.
   */
  readonly total_distance: number
  readonly updated_at: number
}
/**
 * A named block of a template: `warmup:`, `main:`, and so on.
 */
export interface ParsedSection {
  readonly lines: readonly ParsedLine[]
  readonly name: string
  /**
   * The header line as written. Absent for the leading block, which has no header of its own and is where the template's metadata lives.
   */
  readonly raw?: string
}
/**
 * A repetition count over one or more parts.
 */
export interface SetLine {
  readonly interval?: Interval
  readonly kind: 'set'
  /**
   * Text after `#`. Displayed, never parsed.
   */
  readonly note?: string
  readonly pace?: Interval
  /**
   * @minItems 1
   */
  readonly parts: readonly [SetPart, ...SetPart[]]
  /**
   * A shape over the set. Scoped rather than a bare id, because the same word means different things at different scopes.
   */
  readonly pattern?: AppliedPattern
  readonly raw: string
  /**
   * A fixed count, or a `{reps:MIN-MAX}` slot resolved per swimmer.
   */
  readonly reps: number | RepsSlot
  /**
   * Catalogue id: how repetitions are shared out, when they are shared at all.
   */
  readonly structure?: string
}
/**
 * Relative to the swimmer's base pace for the relevant stroke group.
 */
export interface BaseInterval {
  readonly kind: 'base'
  /**
   * Seconds added to base pace. Zero for a bare `base`, negative for `base-5`.
   */
  readonly offset_seconds: number
}
/**
 * An absolute time, read as written.
 */
export interface LiteralInterval {
  readonly kind: 'literal'
  readonly seconds: number
}
/**
 * One activity within a set. Most sets have exactly one part; a compound set like `25 drill / 50 swim` has several inside a single repetition.
 */
export interface SetPart {
  /**
   * Catalogue id, when the descriptor named an activity we recognise.
   */
  readonly activity?: string
  /**
   * The words naming the activity and its modifiers, verbatim.
   */
  readonly descriptor: string
  /**
   * Catalogue id of the effort band, when the descriptor named one.
   */
  readonly effort?: string
  /**
   * Catalogue ids, in the order the descriptor named them. Absent when none.
   */
  readonly equipment?: readonly string[]
  readonly extent: Extent
}
/**
 * A distance in pool units. Always a positive multiple of 25.
 */
export interface Distance {
  readonly kind: 'distance'
  readonly value: number
}
/**
 * A duration in seconds, taken as written rather than rounded.
 */
export interface Duration {
  readonly kind: 'time'
  readonly seconds: number
}
/**
 * A pattern as it applies to one set, resolved to a scope.
 */
export interface AppliedPattern {
  /**
   * Catalogue id.
   */
  readonly id: string
  /**
   * Only ever set on an `across_set` pattern; repetitions are what it counts.
   */
  readonly range?: RepRange
  readonly scope: PatternScope
}
/**
 * The repetitions a pattern spans — `descend 1-4` is 1 through 4.
 */
export interface RepRange {
  readonly from: number
  readonly to: number
}
/**
 * A `{reps:MIN-MAX}` slot, resolved per swimmer from their load factor.
 */
export interface RepsSlot {
  readonly max: number
  readonly min: number
}
/**
 * A `key: value` header field, from the block before the first section.
 */
export interface MetaLine {
  readonly key: string
  readonly kind: 'meta'
  readonly raw: string
  readonly value: string
}
/**
 * A line the grammar does not recognise, kept exactly as written.
 */
export interface UnparsedLine {
  readonly kind: 'unparsed'
  readonly raw: string
}
export interface Settings {
  readonly created_at: number
  readonly deleted: boolean
  readonly id: string
  readonly pool_length: number
  readonly pool_unit: PoolUnit
  readonly updated_at: number
}
export interface Swimmer {
  readonly base_pace_by_stroke: BasePaceByStroke
  readonly birth_year: number
  readonly created_at: number
  readonly deleted: boolean
  readonly id: string
  readonly is_youth: boolean
  /**
   * Scales rep counts and send-offs. Clamped by the adaptation rules.
   */
  readonly load_factor: number
  readonly name: string
  readonly updated_at: number
}
/**
 * Free is always tested; the other strokes fall back to free plus a fixed offset.
 */
export interface BasePaceByStroke {
  readonly back?: number
  readonly breast?: number
  readonly fly?: number
  /**
   * Sustainable seconds per 100, in the pool's unit.
   */
  readonly free: number
}
/**
 * An arrangement — named sections holding sets in order.
 */
export interface Template {
  readonly created_at: number
  readonly deleted: boolean
  readonly id: string
  readonly intensity: Intensity
  readonly level_range: LevelRange
  readonly name: string
  /**
   * Cache of `raw_text` parsed by the template parser.
   */
  readonly parsed_sets?: readonly ParsedSection[]
  /**
   * The template in swim shorthand. Authoritative; everything else is derived.
   */
  readonly raw_text: string
  readonly tags: readonly string[]
  readonly updated_at: number
}
export interface LevelRange {
  readonly max: number
  readonly min: number
}
/**
 * A base pace test.
 */
export interface TestSet {
  readonly computed_base_pace: number
  readonly created_at: number
  readonly date: number
  readonly deleted: boolean
  readonly id: string
  readonly protocol: TestProtocol
  readonly swimmer_id: string
  /**
   * Seconds for the shorter swim: the 200, or the 100 under the youth protocol.
   */
  readonly t200: number
  /**
   * Seconds for the longer swim: the 400, or the 200 under the youth protocol.
   */
  readonly t400: number
  readonly updated_at: number
}
/**
 * What an activity is and how it is paced.
 */
export interface Activity {
  /**
   * The words a template author might write for it. Matched normalised, so case and stray whitespace in a row a swimmer added do not stop it matching.
   *
   * @minItems 1
   */
  readonly aliases: readonly [string, ...string[]]
  readonly extent_kind: ActivityExtentKind
  readonly id: string
  readonly mode?: ActivityMode
  readonly name: string
  /**
   * A paced activity takes its send-off from the swimmer's base pace for the relevant stroke group. An unpaced one has none, and an interval on it is read literally.
   */
  readonly paced: boolean
  readonly stroke_group?: StrokeGroup
}
/**
 * A qualitative effort band. Distinct from pace, which is always a number: "easy" is not a time, and no amount of arithmetic turns it into one.
 */
export interface EffortBand {
  /**
   * The words a template author might write for it. Matched normalised, so case and stray whitespace in a row a swimmer added do not stop it matching.
   *
   * @minItems 1
   */
  readonly aliases: readonly [string, ...string[]]
  readonly id: string
  readonly name: string
  /**
   * Ordering from easiest to hardest, so a selection rule can ask which of two sets is harder without parsing English. An ordering, never a pace — the gap between two ranks means nothing.
   */
  readonly rank: number
}
/**
 * Something the swimmer holds or wears. Several can apply at once — fins and a snorkel is an ordinary thing to be asked for — so a part carries a list.
 */
export interface Equipment {
  /**
   * The words a template author might write for it. Matched normalised, so case and stray whitespace in a row a swimmer added do not stop it matching.
   *
   * @minItems 1
   */
  readonly aliases: readonly [string, ...string[]]
  readonly id: string
  readonly implies_mode?: ActivityMode
  readonly name: string
}
/**
 * A shape over a set, or within each repetition of one.
 */
export interface Pattern {
  /**
   * The words a template author might write for it. Matched normalised, so case and stray whitespace in a row a swimmer added do not stop it matching.
   *
   * @minItems 1
   */
  readonly aliases: readonly [string, ...string[]]
  readonly id: string
  readonly name: string
  /**
   * The scopes this pattern can carry, the one it means by default first.
   *
   * @minItems 1
   */
  readonly scopes: readonly [PatternScope, ...PatternScope[]]
}
/**
 * Every stored record carries sync metadata from day one: deletes are soft, and both timestamps exist so a future backend can resolve conflicts.
 */
export interface RecordMeta {
  readonly created_at: number
  readonly deleted: boolean
  readonly id: string
  readonly updated_at: number
}
/**
 * How repetitions are distributed between swimmers, rather than what is swum.
 */
export interface Structure {
  /**
   * The words a template author might write for it. Matched normalised, so case and stray whitespace in a row a swimmer added do not stop it matching.
   *
   * @minItems 1
   */
  readonly aliases: readonly [string, ...string[]]
  readonly id: string
  /**
   * A relay is not a thing one swimmer can do alone.
   */
  readonly min_swimmers: number
  readonly name: string
}
/**
 * What every catalogue entry has in common: a stable id, a display name, and the words a template author might actually write for it.
 */
export interface Term {
  /**
   * The words a template author might write for it. Matched normalised, so case and stray whitespace in a row a swimmer added do not stop it matching.
   *
   * @minItems 1
   */
  readonly aliases: readonly [string, ...string[]]
  readonly id: string
  readonly name: string
}
