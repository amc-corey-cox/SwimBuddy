import { roundToNearest25 } from './units'
import { recogniseActivity } from './activities'
import type {
  Extent,
  Intensity,
  Interval,
  LevelRange,
  ParsedLine,
  ParsedSection,
  RepCount,
  SetPart,
} from './types'

/**
 * Parses a workout template written in the swim shorthand from docs/spec.md.
 *
 * The governing rule is that content is never lost. A line the grammar does not
 * recognise is kept verbatim as an `unparsed` line rather than dropped or
 * guessed at, and even recognised lines keep their original text. A template is
 * something a person wrote; the parser's job is to add structure on top of it,
 * not to replace it.
 */
export interface ParsedTemplate {
  readonly name?: string
  readonly tags: readonly string[]
  readonly intensity?: Intensity
  readonly level_range?: LevelRange
  readonly sections: readonly ParsedSection[]
}

/** Metadata keys the header understands. Anything else stays an unparsed line. */
const META_KEYS = new Set(['name', 'tags', 'intensity', 'level'])

const INTENSITIES = new Set<Intensity>(['easy', 'moderate', 'hard'])

/** `warmup:` — a bare word and a colon, with nothing following it. */
const SECTION_HEADER = /^([A-Za-z][\w -]*):\s*$/

/** `name: Aerobic base` — a key, a colon, and a value. */
const META_LINE = /^([A-Za-z][\w-]*):\s+(.*\S)\s*$/

/**
 * `4x50`, `{reps:4-8}x100`, `2x1:00`, or a bare `300`. The extent is either a
 * distance or a clock duration; an interval, when present, comes after `@`.
 */
const SET_HEAD = /^(?:(\{reps:(\d+)-(\d+)\}|\d+)\s*[x×]\s*)?(\d+:[0-5]\d|\d+)\b/

const REPS_SLOT = /^\{reps:(\d+)-(\d+)\}$/

/** The whole interval grammar: `base`, `base+15`, `base-5`, or a clock time like `1:30`. */
const BASE_INTERVAL = /^base\s*([+-]\s*\d+)?$/i
const CLOCK_INTERVAL = /^(\d+):([0-5]\d)$/

export function parseTemplate(text: string): ParsedTemplate {
  const sections: ParsedSection[] = []
  let current: { name: string; raw: string | null; lines: ParsedLine[] } = {
    name: '',
    raw: null,
    lines: [],
  }

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue

    const header = SECTION_HEADER.exec(raw.trim())
    if (header?.[1]) {
      if (current.lines.length > 0 || current.raw !== null) sections.push(current)
      current = { name: header[1].toLowerCase(), raw, lines: [] }
      continue
    }

    const parsed = parseLine(raw)
    // Header fields only exist in the block before the first section. A
    // metadata-shaped line inside `main:` is just text, and is kept as text
    // rather than silently overriding the template's intensity or level.
    current.lines.push(
      parsed.kind === 'meta' && current.raw !== null
        ? { kind: 'unparsed', raw: parsed.raw }
        : parsed,
    )
  }

  if (current.lines.length > 0 || current.raw !== null) sections.push(current)

  return { ...readMetadata(sections), sections }
}

/** Parses one line, falling back to `unparsed` rather than guessing. */
export function parseLine(raw: string): ParsedLine {
  const { body, note } = splitNote(raw)
  const trimmed = body.trim()

  if (trimmed === '') return { kind: 'unparsed', raw }

  const meta = META_LINE.exec(trimmed)
  if (meta?.[1] && meta[2] !== undefined && META_KEYS.has(meta[1].toLowerCase())) {
    return { kind: 'meta', key: meta[1].toLowerCase(), value: meta[2], raw }
  }

  return parseSet(raw, trimmed, note) ?? { kind: 'unparsed', raw }
}

function parseSet(raw: string, trimmed: string, note: string | undefined): ParsedLine | null {
  const { text, interval } = splitInterval(trimmed)

  const head = SET_HEAD.exec(text)
  if (!head?.[4]) return null

  const reps = parseReps(head[1])
  if (reps === null) return null

  const extent = parseExtent(head[4])
  if (extent === null) return null

  const descriptor = text.slice(head[0].length).trim()
  const activity = recogniseActivity(descriptor)

  const part: SetPart = {
    extent,
    descriptor,
    ...(activity ? { activity: activity.id } : {}),
  }

  return {
    kind: 'set',
    reps,
    parts: [part],
    raw,
    ...(interval ? { interval } : {}),
    ...(note !== undefined ? { note } : {}),
  }
}

/**
 * A set's extent is a distance or a duration. Distances round to the nearest 25
 * because pools come in lengths; durations are taken as written.
 */
export function parseExtent(text: string): Extent | null {
  const clock = /^(\d+):([0-5]\d)$/.exec(text)
  if (clock?.[1] && clock[2]) {
    const seconds = Number(clock[1]) * 60 + Number(clock[2])
    return seconds > 0 ? { kind: 'time', seconds } : null
  }

  if (!/^\d+$/.test(text)) return null

  const value = roundToNearest25(Number(text))
  return value > 0 ? { kind: 'distance', value } : null
}

/** Text after `#` is a coaching note: displayed, never parsed. */
function splitNote(raw: string): { body: string; note?: string } {
  const hash = raw.indexOf('#')
  if (hash === -1) return { body: raw }

  const note = raw.slice(hash + 1).trim()
  return note === '' ? { body: raw.slice(0, hash) } : { body: raw.slice(0, hash), note }
}

/**
 * Splits a trailing `@ interval` off a set. An `@` that is not followed by a
 * recognisable interval is left in the descriptor rather than discarded.
 */
function splitInterval(trimmed: string): { text: string; interval?: Interval } {
  const at = trimmed.lastIndexOf('@')
  if (at === -1) return { text: trimmed }

  const interval = parseInterval(trimmed.slice(at + 1).trim())
  if (!interval) return { text: trimmed }

  return { text: trimmed.slice(0, at).trim(), interval }
}

export function parseInterval(text: string): Interval | null {
  const base = BASE_INTERVAL.exec(text)
  if (base) {
    const offset = base[1] ? Number(base[1].replace(/\s+/g, '')) : 0
    return { kind: 'base', offset_seconds: offset }
  }

  const clock = CLOCK_INTERVAL.exec(text)
  if (clock?.[1] && clock[2]) {
    return { kind: 'literal', seconds: Number(clock[1]) * 60 + Number(clock[2]) }
  }

  return null
}

/**
 * Returns null when the count is present but nonsensical — an inverted range, or
 * zero — so the caller leaves the whole line unparsed rather than inventing a
 * repetition count. SET_HEAD has already established that the text is either a
 * well-formed slot or digits.
 */
function parseReps(text: string | undefined): RepCount | null {
  if (text === undefined) return 1

  const slot = REPS_SLOT.exec(text)
  if (slot?.[1] && slot[2]) {
    const min = Number(slot[1])
    const max = Number(slot[2])
    return min > 0 && max >= min ? { min, max } : null
  }

  const reps = Number(text)
  return reps > 0 ? reps : null
}

/** Reads the header fields out of the leading block, which is the only place they live. */
function readMetadata(sections: readonly ParsedSection[]): Omit<ParsedTemplate, 'sections'> {
  const meta = new Map<string, string>()
  const header = sections.find((section) => section.raw === null)
  for (const line of header?.lines ?? []) {
    if (line.kind === 'meta') meta.set(line.key, line.value)
  }

  const name = meta.get('name')
  const intensity = meta.get('intensity')?.toLowerCase()
  const level = meta.get('level')
  const levelRange = level ? parseLevelRange(level) : null

  return {
    tags: splitTags(meta.get('tags')),
    ...(name !== undefined ? { name } : {}),
    ...(intensity && INTENSITIES.has(intensity as Intensity)
      ? { intensity: intensity as Intensity }
      : {}),
    ...(levelRange ? { level_range: levelRange } : {}),
  }
}

function splitTags(value: string | undefined): readonly string[] {
  if (value === undefined) return []
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== '')
}

function parseLevelRange(value: string): LevelRange | null {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(value.trim())
  if (range?.[1] && range[2]) {
    const min = Number(range[1])
    const max = Number(range[2])
    return max >= min ? { min, max } : null
  }

  const single = /^\d+$/.exec(value.trim())
  if (single) return { min: Number(value.trim()), max: Number(value.trim()) }

  return null
}
