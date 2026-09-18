/**
 * The data model from CLAUDE.md, as pure types.
 *
 * Field names stay snake_case to match the spec exactly, so records map cleanly
 * onto a future sync server without a translation layer.
 */

/** Epoch milliseconds. */
export type Timestamp = number

/** A client-generated UUIDv4. Never an auto-increment integer — see CLAUDE.md. */
export type Uuid = string

/**
 * Every stored record carries sync metadata from day one: deletes are soft, and
 * both timestamps exist so a future backend can resolve conflicts.
 */
export interface RecordMeta {
  readonly id: Uuid
  readonly created_at: Timestamp
  readonly updated_at: Timestamp
  readonly deleted: boolean
}

export type StrokeGroup = 'free' | 'back' | 'breast' | 'fly'
export type PoolUnit = 'yards' | 'meters'
export type Intensity = 'easy' | 'moderate' | 'hard'
export type EffortRating = 'too_easy' | 'about_right' | 'too_hard'
export type FunRating = 'up' | 'down'

/**
 * Seconds added to the tested free base pace when a stroke has not been tested
 * separately. Values fixed by the spec.
 */
export const STROKE_OFFSETS: Readonly<Record<Exclude<StrokeGroup, 'free'>, number>> = {
  back: 10,
  breast: 15,
  fly: 12,
}

/** Free is always tested; the other strokes fall back to free + STROKE_OFFSETS. */
export interface BasePaceByStroke {
  readonly free: number
  readonly back?: number
  readonly breast?: number
  readonly fly?: number
}

export interface Swimmer extends RecordMeta {
  readonly name: string
  readonly birth_year: number
  readonly base_pace_by_stroke: BasePaceByStroke
  readonly load_factor: number
  readonly is_youth: boolean
}

/** `base+15`, `base-5`, `base`, or a literal clock time like `1:30`. */
export type Interval =
  | { readonly kind: 'base'; readonly offset_seconds: number }
  | { readonly kind: 'literal'; readonly seconds: number }

/** A fixed count, or a `{reps:MIN-MAX}` slot resolved per swimmer. */
export type RepCount = number | { readonly min: number; readonly max: number }

/**
 * What every catalogue entry has in common: a stable id, a display name, and the
 * words a template author might actually write for it.
 *
 * Activities, equipment, effort bands, patterns and structures are all data
 * rather than code — adding one is a row, never a release — so they share a
 * shape and a matcher rather than each growing their own.
 */
export interface Term {
  readonly id: string
  readonly name: string
  /** The words a template author might write for it. */
  readonly aliases: readonly string[]
}

export type ActivityMode = 'swim' | 'kick' | 'pull' | 'drill'

/**
 * A catalogue entry: what an activity is and how it is paced.
 *
 * A **paced** activity takes its send-off from the swimmer's base pace for the
 * relevant stroke group. An unpaced one — treading water, an underwater dolphin
 * — has no base-pace send-off, and an interval on it is read literally.
 */
export interface Activity extends Term {
  readonly paced: boolean
  readonly stroke_group?: StrokeGroup
  readonly mode?: ActivityMode
  readonly extent_kind: 'distance' | 'time' | 'either'
}

/**
 * Something the swimmer holds or wears. Several can apply at once — fins and a
 * snorkel is an ordinary thing to be asked for — so a part carries a list.
 */
export interface Equipment extends Term {
  /** What holding it implies about how the swimmer is moving, where it implies anything. */
  readonly implies_mode?: ActivityMode
}

/**
 * A qualitative effort band. Distinct from pace, which is always a number:
 * "easy" is not a time, and no amount of arithmetic turns it into one.
 */
export interface EffortBand extends Term {
  /** Ordering from easiest to hardest. A hint for selection rules, never a pace. */
  readonly rank: number
}

/**
 * Where a pattern applies. `build` is the reason this exists and is two
 * different instructions: a bare "4x50 build" shapes each repetition, starting
 * easy and finishing fast within the 50, while "4x50 build 1-4" shapes the set,
 * each repetition faster than the one before it. Neither expresses the other.
 */
export type PatternScope = 'within_rep' | 'across_set'

export interface Pattern extends Term {
  /** The scopes this pattern can carry, the one it means by default first. */
  readonly scopes: readonly [PatternScope, ...PatternScope[]]
}

/** How repetitions are distributed between swimmers, rather than what is swum. */
export interface Structure extends Term {
  /** A relay is not a thing one swimmer can do alone. */
  readonly min_swimmers: number
}

/** The repetitions a pattern spans: `descend 1-4` is 1 through 4. */
export interface RepRange {
  readonly from: number
  readonly to: number
}

/** A pattern as it applies to one set, resolved to a scope. */
export interface AppliedPattern {
  /** Catalogue id. */
  readonly id: string
  readonly scope: PatternScope
  /** Only ever set on an `across_set` pattern; repetitions are what it counts. */
  readonly range?: RepRange
}

/**
 * How much of a thing a set part is: a distance in pool units, or a duration.
 * Never both — "20:00 free" knows its time and not its distance, and treading
 * water has no distance at all.
 */
export type Extent =
  | { readonly kind: 'distance'; readonly value: number }
  | { readonly kind: 'time'; readonly seconds: number }

/**
 * One activity within a set. Most sets have exactly one part; a compound set
 * like `25 drill / 50 swim` has several inside a single repetition.
 */
export interface SetPart {
  readonly extent: Extent
  /** Catalogue id, when the descriptor named an activity we recognise. */
  readonly activity?: string
  /** Catalogue ids, in the order the descriptor named them. Absent when none. */
  readonly equipment?: readonly string[]
  /** Catalogue id of the effort band, when the descriptor named one. */
  readonly effort?: string
  /** The words naming the activity and its modifiers, verbatim. */
  readonly descriptor: string
}

/**
 * One line of a template after parsing.
 *
 * Every variant keeps `raw`. The spec is emphatic that unparseable lines are
 * preserved verbatim and never lost, and keeping the original text on the
 * parsed variants too means the workout view can always fall back to it.
 */
export type ParsedLine =
  | {
      readonly kind: 'set'
      readonly reps: RepCount
      readonly parts: readonly SetPart[]
      /** When to leave: the send-off. */
      readonly interval?: Interval
      /**
       * How fast to swim it. Distinct from the interval — a swimmer can be given
       * both, and "leave every 1:30" is a different instruction from "hold 1:20".
       * Same shape, because a pace is written the same way a send-off is.
       */
      readonly pace?: Interval
      /**
       * A shape over the set. Scoped rather than a bare id, because the same
       * word means different things at different scopes — see PatternScope.
       */
      readonly pattern?: AppliedPattern
      /** Catalogue id: how repetitions are shared out, when they are shared at all. */
      readonly structure?: string
      readonly note?: string
      readonly raw: string
    }
  | { readonly kind: 'meta'; readonly key: string; readonly value: string; readonly raw: string }
  | { readonly kind: 'unparsed'; readonly raw: string }

/** A named block of a template: `warmup:`, `main:`, and so on. */
export interface ParsedSection {
  readonly name: string
  /** The header line as written, or null for lines appearing before any header. */
  readonly raw: string | null
  readonly lines: readonly ParsedLine[]
}

export interface LevelRange {
  readonly min: number
  readonly max: number
}

export interface Template extends RecordMeta {
  readonly name: string
  readonly tags: readonly string[]
  readonly intensity: Intensity
  readonly level_range: LevelRange
  readonly raw_text: string
  /** Cache of `raw_text` parsed by the template parser. `raw_text` stays authoritative. */
  readonly parsed_sets?: readonly ParsedSection[]
}

export interface Session extends RecordMeta {
  readonly swimmer_id: Uuid
  readonly template_id: Uuid
  readonly date: Timestamp
  /** Filled by the resolver in step 5; absent until then. */
  readonly resolved_sets?: readonly ParsedSection[]
  readonly total_distance: number
  readonly effort_rating: EffortRating | null
  readonly completed: boolean | null
  /** Youth swimmers only. */
  readonly fun_rating?: FunRating
  readonly notes: string
}

/**
 * A base pace test. The spec uses a rested 400 and 200 for adults; youth swim a
 * 200 and 100 instead and are never pushed to maximal effort. `protocol` records
 * which pair the numbers are, since the two are computed differently.
 */
export interface TestSet extends RecordMeta {
  readonly swimmer_id: Uuid
  readonly date: Timestamp
  readonly protocol: '400/200' | '200/100'
  /** Seconds for the longer swim: the 400, or the 200 under the youth protocol. */
  readonly t400: number
  /** Seconds for the shorter swim: the 200, or the 100 under the youth protocol. */
  readonly t200: number
  readonly computed_base_pace: number
}

export interface Settings extends RecordMeta {
  readonly pool_unit: PoolUnit
  readonly pool_length: number
}

/** Bumped whenever a migration is added. */
export const SCHEMA_VERSION = 1

/** The whole store, which is also the shape of the JSON export/import file. */
export interface StoreSnapshot {
  readonly version: number
  readonly swimmers: readonly Swimmer[]
  readonly templates: readonly Template[]
  readonly sessions: readonly Session[]
  readonly test_sets: readonly TestSet[]
  readonly settings: Settings
}
