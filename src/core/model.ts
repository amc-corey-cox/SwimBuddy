/**
 * GENERATED FROM schema/swimbuddy.yaml — DO NOT EDIT.
 *
 * Regenerate with `npm run schema:gen`. Change the model by changing the schema;
 * an edit here is lost on the next run and, worse, makes the schema a lie.
 */
/* eslint-disable */

export type TermId = string;
export type ActivityId = string;
export type EquipmentId = string;
export type EffortBandId = string;
export type PatternId = string;
export type StructureId = string;
export type RecordMetaId = string;
export type SwimmerId = string;
export type TemplateId = string;
export type SessionId = string;
export type TestSetId = string;
export type SettingsId = string;

export type StrokeGroup = 'free' | 'back' | 'breast' | 'fly'

export type PoolUnit = 'yards' | 'meters'
/**
* How hard a whole template is meant to be.
*/
export type Intensity = 'easy' | 'moderate' | 'hard'
/**
* What the swimmer says afterwards. Not an effort band on a set.
*/
export type EffortRating = 'too_easy' | 'about_right' | 'too_hard'
/**
* Youth swimmers only.
*/
export type FunRating = 'up' | 'down'

export type ActivityMode = 'swim' | 'kick' | 'pull' | 'drill'
/**
* How an activity can be measured. `either` means both — sculling is swum for a distance or held for a time, and the set decides which.
*/
export type ActivityExtentKind = 'distance' | 'time' | 'either'
/**
* Where a pattern applies. `build` is the reason this exists and is two different instructions: a bare "4x50 build" shapes each repetition, starting easy and finishing fast within the 50, while "4x50 build 1-4" shapes the set, each repetition faster than the one before it. Neither expresses the other.
*/
export type PatternScope = 'within_rep' | 'across_set'
/**
* Which pair of swims a base pace test recorded. Adults swim a 400 and a 200, youth a 200 and a 100, and the two compute base pace differently.
*/
export type TestProtocol = '400/200' | '200/100'


/**
 * How much of a thing a set part is: a distance in pool units, or a duration. Never both — "20:00 free" knows its time and not its distance, and treading water has no distance at all.
 */
export type Extent = Distance | Duration


/**
 * A distance in pool units. Always a positive multiple of 25.
 */
export interface Distance {
    readonly kind: 'distance',
    readonly value: number,
}


/**
 * A duration in seconds, taken as written rather than rounded.
 */
export interface Duration {
    readonly kind: 'time',
    readonly seconds: number,
}


/**
 * `base+15`, `base-5`, `base`, or a literal clock time like `1:30`. Used both for a send-off and for a pace target, because a swimmer writes them the same way.
 */
export type Interval = BaseInterval | LiteralInterval


/**
 * Relative to the swimmer's base pace for the relevant stroke group.
 */
export interface BaseInterval {
    readonly kind: 'base',
    /** Seconds added to base pace. Zero for a bare `base`, negative for `base-5`. */
    readonly offset_seconds: number,
}


/**
 * An absolute time, read as written.
 */
export interface LiteralInterval {
    readonly kind: 'literal',
    readonly seconds: number,
}


/**
 * A `{reps:MIN-MAX}` slot, resolved per swimmer from their load factor.
 */
export interface RepsSlot {
    readonly min: number,
    readonly max: number,
}


/**
 * The repetitions a pattern spans — `descend 1-4` is 1 through 4.
 */
export interface RepRange {
    readonly from: number,
    readonly to: number,
}


/**
 * A pattern as it applies to one set, resolved to a scope.
 */
export interface AppliedPattern {
    /** Catalogue id. */
    readonly id: string,
    readonly scope: PatternScope,
    /** Only ever set on an `across_set` pattern; repetitions are what it counts. */
    readonly range?: RepRange,
}


/**
 * One activity within a set. Most sets have exactly one part; a compound set like `25 drill / 50 swim` has several inside a single repetition.
 */
export interface SetPart {
    readonly extent: Extent,
    /** Catalogue id, when the descriptor named an activity we recognise. */
    readonly activity?: string,
    /** Catalogue ids, in the order the descriptor named them. Absent when none. */
    readonly equipment?: readonly string[],
    /** Catalogue id of the effort band, when the descriptor named one. */
    readonly effort?: string,
    /** The words naming the activity and its modifiers, verbatim. */
    readonly descriptor: string,
}


/**
 * One line of a template after parsing. Every variant keeps `raw`: unparseable lines are preserved verbatim and never lost, and keeping the original text on the parsed variants too means the workout view can always fall back to it.
 */
export type ParsedLine = SetLine | MetaLine | UnparsedLine


/**
 * A repetition count over one or more parts.
 */
export interface SetLine {
    readonly kind: 'set',
    /** A fixed count, or a `{reps:MIN-MAX}` slot resolved per swimmer. */
    readonly reps: number | RepsSlot,
    readonly parts: readonly [SetPart, ...SetPart[]],
    /** When to leave: the send-off. */
    readonly interval?: Interval,
    /** How fast to swim it. Distinct from the interval — a swimmer can be given both, and "leave every 1:30" is a different instruction from "hold 1:20". */
    readonly pace?: Interval,
    /** A shape over the set. Scoped rather than a bare id, because the same word means different things at different scopes. */
    readonly pattern?: AppliedPattern,
    /** Catalogue id: how repetitions are shared out, when they are shared at all. */
    readonly structure?: string,
    /** Text after `#`. Displayed, never parsed. */
    readonly note?: string,
    readonly raw: string,
}


/**
 * A `key: value` header field, from the block before the first section.
 */
export interface MetaLine {
    readonly kind: 'meta',
    readonly key: string,
    readonly value: string,
    readonly raw: string,
}


/**
 * A line the grammar does not recognise, kept exactly as written.
 */
export interface UnparsedLine {
    readonly kind: 'unparsed',
    readonly raw: string,
}


/**
 * A named block of a template: `warmup:`, `main:`, and so on.
 */
export interface ParsedSection {
    readonly name: string,
    /** The header line as written. Absent for the leading block, which has no header of its own and is where the template's metadata lives. */
    readonly raw?: string,
    readonly lines: readonly ParsedLine[],
}


/**
 * One set with every number decided.
 */
export interface ResolvedSet {
    readonly reps: number,
    readonly parts: readonly [SetPart, ...SetPart[]],
    /** When to leave, in seconds. Absent when the set prescribes no interval, or when it asked for one relative to a base pace the activity does not have. */
    readonly send_off_seconds?: number,
    /** How fast to swim it, in seconds. Distinct from the send-off. */
    readonly pace_seconds?: number,
    readonly pattern?: AppliedPattern,
    readonly structure?: string,
    readonly note?: string,
    /** The line as the template author wrote it, kept for display. */
    readonly raw: string,
}


/**
 * A named block of a resolved workout.
 */
export interface ResolvedSection {
    readonly name: string,
    readonly sets: readonly ResolvedSet[],
}


/**
 * A template resolved for one swimmer. Not a stored record on its own — a Session keeps the sections once the workout has been swum.
 */
export interface ResolvedWorkout {
    readonly swimmer_id: string,
    readonly template_id: string,
    readonly sections: readonly ResolvedSection[],
    /** Includes the easy-swim equivalent of any time-measured set, so one number stays comparable week to week. */
    readonly total_distance: number,
    /** True when a safety cap changed the workout — youth session distance is the only one that can today. Worth surfacing rather than silently shrinking a session someone asked for. */
    readonly capped: boolean,
}


/**
 * What every catalogue entry has in common: a stable id, a display name, and the words a template author might actually write for it.
 * Catalogue entries carry the same sync envelope as every other record, because once seeded that is what they are. Their id is semantic rather than a UUID — a parsed set refers to `free` and `back_float`, and those references have to survive an export and an import on another phone.
 */
export interface Term {
    readonly id: string,
    readonly created_at: number,
    readonly updated_at: number,
    /** Lets a swimmer hide a shipped entry without it being dropped. */
    readonly deleted: boolean,
    readonly name: string,
    /** The words a template author might write for it. Matched normalised, so case and stray whitespace in a row a swimmer added do not stop it matching. */
    readonly aliases: readonly [string, ...string[]],
}


/**
 * What an activity is and how it is paced.
 */
export interface Activity extends Term {
    /** A paced activity takes its send-off from the swimmer's base pace for the relevant stroke group. An unpaced one has none, and an interval on it is read literally. */
    readonly paced: boolean,
    /** Only ever set on a paced activity; an unpaced one has no base pace to look up. */
    readonly stroke_group?: StrokeGroup,
    readonly mode?: ActivityMode,
    readonly extent_kind: ActivityExtentKind,
}


/**
 * Something the swimmer holds or wears. Several can apply at once — fins and a snorkel is an ordinary thing to be asked for — so a part carries a list.
 */
export interface Equipment extends Term {
    /** What holding it implies about how the swimmer is moving, where it implies anything. */
    readonly implies_mode?: ActivityMode,
}


/**
 * A qualitative effort band. Distinct from pace, which is always a number: "easy" is not a time, and no amount of arithmetic turns it into one.
 */
export interface EffortBand extends Term {
    /** Ordering from easiest to hardest, so a selection rule can ask which of two sets is harder without parsing English. An ordering, never a pace — the gap between two ranks means nothing. */
    readonly rank: number,
}


/**
 * A shape over a set, or within each repetition of one.
 */
export interface Pattern extends Term {
    /** The scopes this pattern can carry, the one it means by default first. */
    readonly scopes: readonly [PatternScope, ...PatternScope[]],
}


/**
 * How repetitions are distributed between swimmers, rather than what is swum.
 */
export interface Structure extends Term {
    /** A relay is not a thing one swimmer can do alone. */
    readonly min_swimmers: number,
}


/**
 * Every stored record carries sync metadata from day one: deletes are soft, and both timestamps exist so a future backend can resolve conflicts.
 */
export interface RecordMeta {
    readonly id: string,
    readonly created_at: number,
    readonly updated_at: number,
    readonly deleted: boolean,
}


/**
 * Free is always tested; the other strokes fall back to free plus a fixed offset.
 */
export interface BasePaceByStroke {
    /** Sustainable seconds per 100, in the pool's unit. */
    readonly free: number,
    readonly back?: number,
    readonly breast?: number,
    readonly fly?: number,
}



export interface Swimmer extends RecordMeta {
    readonly name: string,
    readonly base_pace_by_stroke: BasePaceByStroke,
    /** Scales rep counts and send-offs. Clamped by the adaptation rules. */
    readonly load_factor: number,
    readonly is_youth: boolean,
}



export interface LevelRange {
    readonly min: number,
    readonly max: number,
}


/**
 * An arrangement — named sections holding sets in order.
 */
export interface Template extends RecordMeta {
    readonly name: string,
    readonly tags: readonly string[],
    readonly intensity: Intensity,
    readonly level_range: LevelRange,
    /** The template in swim shorthand. Authoritative; everything else is derived. */
    readonly raw_text: string,
    /** Cache of `raw_text` parsed by the template parser. */
    readonly parsed_sets?: readonly ParsedSection[],
}


/**
 * One swim. Swims are not measured: a session records how it felt, and the adaptation rules run off that.
 */
export interface Session extends RecordMeta {
    readonly swimmer_id: string,
    readonly template_id: string,
    readonly date: number,
    /** What was actually swum, with every number decided. */
    readonly resolved_sets?: readonly ResolvedSection[],
    /** Includes the easy-swim equivalent of any time-measured sets, so one number stays comparable week to week. */
    readonly total_distance: number,
    /** Absent until the swimmer rates the session. */
    readonly effort_rating?: EffortRating,
    /** Whether the main set was finished. Absent until the swimmer says. */
    readonly completed?: boolean,
    /** Youth swimmers only. */
    readonly fun_rating?: FunRating,
    readonly notes: string,
}


/**
 * A base pace test.
 */
export interface TestSet extends RecordMeta {
    readonly swimmer_id: string,
    readonly date: number,
    readonly protocol: TestProtocol,
    /** Seconds for the longer swim: the 400, or the 200 under the youth protocol. */
    readonly t400: number,
    /** Seconds for the shorter swim: the 200, or the 100 under the youth protocol. */
    readonly t200: number,
    readonly computed_base_pace: number,
}



export interface Settings extends RecordMeta {
    readonly pool_unit: PoolUnit,
    readonly pool_length: number,
}


/**
 * The whole store, which is also the shape of the JSON export/import file. This is the schema's tree root, so the generated JSON Schema validates an import file directly.
 */
export interface StoreSnapshot {
    /** Bumped whenever a migration is added. */
    readonly version: number,
    readonly swimmers: readonly Swimmer[],
    readonly templates: readonly Template[],
    readonly sessions: readonly Session[],
    readonly test_sets: readonly TestSet[],
    readonly settings: Settings,
    readonly activities: readonly Activity[],
    readonly equipment: readonly Equipment[],
    readonly effort_bands: readonly EffortBand[],
    readonly patterns: readonly Pattern[],
    readonly structures: readonly Structure[],
}
