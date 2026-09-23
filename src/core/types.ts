/**
 * The data model.
 *
 * Almost all of it is generated: the shapes come from `schema/swimbuddy.yaml` via
 * `./model`, and this file is the public face of them plus the handful of things a
 * schema cannot carry — values rather than types, and two aliases derived from
 * generated shapes so they cannot drift from them.
 *
 * Import from here, not from `./model`. Field names stay snake_case to match the
 * spec exactly, so records map cleanly onto a future sync server without a
 * translation layer.
 */
export type {
  Activity,
  ActivityExtentKind,
  ActivityMode,
  AppliedPattern,
  BaseInterval,
  BasePaceByStroke,
  Distance,
  Duration,
  EffortBand,
  EffortRating,
  Equipment,
  Extent,
  FunRating,
  Intensity,
  Interval,
  LevelRange,
  LiteralInterval,
  MetaLine,
  ParsedLine,
  ParsedSection,
  Pattern,
  PatternScope,
  PoolUnit,
  RecordMeta,
  RepRange,
  RepsSlot,
  ResolvedSection,
  ResolvedSet,
  ResolvedWorkout,
  Session,
  SetLine,
  SetPart,
  Settings,
  StoreSnapshot,
  StrokeGroup,
  Structure,
  Swimmer,
  Template,
  Term,
  TestProtocol,
  TestSet,
  UnparsedLine,
} from './model'

import type { SetLine, Swimmer, StrokeGroup } from './model'

/** Epoch milliseconds. */
export type Timestamp = number

/** A client-generated UUIDv4. Never an auto-increment integer — see docs/spec.md. */
export type Uuid = string

/**
 * A fixed count, or a `{reps:MIN-MAX}` slot resolved per swimmer.
 *
 * Read off the generated shape rather than restated, because LinkML cannot name a
 * union of a number and a class — and a restated alias is exactly the kind of
 * second copy this whole exercise exists to remove.
 */
export type RepCount = SetLine['reps']

/** The pace table a swimmer carries, keyed by stroke group. */
export type BasePaceTable = Swimmer['base_pace_by_stroke']

/**
 * Seconds added to the tested free base pace when a stroke has not been tested
 * separately. Values fixed by the spec.
 *
 * A value, not a type, so it stays here: the schema describes the shape of a
 * record, not the constants the rules apply to one.
 */
export const STROKE_OFFSETS: Readonly<Record<Exclude<StrokeGroup, 'free'>, number>> = {
  back: 10,
  breast: 15,
  fly: 12,
}

/** Bumped whenever a migration is added. Kept in step with `DATABASE_VERSION`. */
export const SCHEMA_VERSION = 3
