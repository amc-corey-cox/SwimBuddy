/**
 * Pure helpers for pool distances. Nothing in src/core/ may touch the DOM or
 * storage — it has to run unchanged on a server later.
 */

/** Swum distances always land on a pool-length multiple of 25. */
export function roundToNearest25(distance: number): number {
  return Math.round(distance / 25) * 25
}

/** Format a number of seconds as the m:ss a swimmer reads off a pace clock. */
export function formatSendOff(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds)
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
