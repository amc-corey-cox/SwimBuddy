/**
 * Turning model numbers into what goes on a wet phone at arm's length.
 *
 * The spec is specific that the workout view shows resolved distances and
 * send-off times and never formulas, so `base+15` is a thing this module has no
 * way to render — by the time anything gets here it is already seconds.
 */

/** Seconds as `m:ss`, or `h:mm:ss` past an hour. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return `${hours > 0 ? `${String(hours)}:` : ''}${mm}:${String(rest).padStart(2, '0')}`
}

/** `8x100` or, for a single repetition, just the extent. */
export function repetitions(reps: number, extent: string): string {
  return reps === 1 ? extent : `${String(reps)}×${extent}`
}

/** A distance in pool units, or a duration — whichever the part is measured in. */
export function extent(part: {
  extent: { kind: string; value?: number; seconds?: number }
}): string {
  if (part.extent.kind === 'distance') return String(part.extent.value ?? 0)
  return clock(part.extent.seconds ?? 0)
}

/** `1,250 yards`, with the unit the pool is actually measured in. */
export function distance(total: number, unit: 'yards' | 'meters'): string {
  return `${total.toLocaleString('en-US')} ${unit}`
}
