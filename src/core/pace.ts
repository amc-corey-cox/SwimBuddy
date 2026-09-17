import type { BasePaceByStroke, StrokeGroup, TestSet } from './types'
import { STROKE_OFFSETS } from './types'

/**
 * Base pace for a stroke: the tested value when there is one, otherwise the
 * tested free pace plus that stroke's fixed offset.
 */
export function basePaceFor(paces: BasePaceByStroke, stroke: StrokeGroup): number {
  if (stroke === 'free') return paces.free
  const tested = paces[stroke]
  return tested ?? paces.free + STROKE_OFFSETS[stroke]
}

/**
 * Seconds of swimming that separate the two timed swims, expressed in 100s.
 *
 * A rested 400 and 200 differ by 200 of distance, so the difference covers two
 * 100s. The youth 200/100 protocol differs by a single 100.
 */
const HUNDREDS_BETWEEN_SWIMS: Readonly<Record<TestSet['protocol'], number>> = {
  '400/200': 2,
  '200/100': 1,
}

/**
 * Base pace in seconds per 100, from a rested test pair.
 *
 * The long swim's extra distance, swum at sustainable pace, is what the test
 * measures: `(T_long - T_short) / hundreds_between`. For the standard adult
 * protocol that is the spec's `(T400 - T200) / 2`.
 */
export function computeBasePace(
  longSwimSeconds: number,
  shortSwimSeconds: number,
  protocol: TestSet['protocol'] = '400/200',
): number {
  const difference = longSwimSeconds - shortSwimSeconds
  if (difference <= 0) {
    throw new RangeError(
      `Long swim (${String(longSwimSeconds)}s) must take longer than the short swim (${String(shortSwimSeconds)}s)`,
    )
  }
  return difference / HUNDREDS_BETWEEN_SWIMS[protocol]
}
