import { describe, expect, it } from 'vitest'
import { basePaceFor, computeBasePace } from './pace'
import type { BasePaceByStroke } from './types'

describe('basePaceFor', () => {
  const testedFreeOnly: BasePaceByStroke = { free: 90 }

  it('returns the tested free pace directly', () => {
    expect(basePaceFor(testedFreeOnly, 'free')).toBe(90)
  })

  it.each([
    ['back', 100],
    ['breast', 105],
    ['fly', 102],
  ] as const)('falls back to free + offset for %s', (stroke, expected) => {
    expect(basePaceFor(testedFreeOnly, stroke)).toBe(expected)
  })

  it('prefers a separately tested stroke over the offset', () => {
    const withTestedBack: BasePaceByStroke = { free: 90, back: 97 }
    expect(basePaceFor(withTestedBack, 'back')).toBe(97)
  })

  it('uses a tested value even when it is faster than free', () => {
    const strongBreaststroker: BasePaceByStroke = { free: 90, breast: 88 }
    expect(basePaceFor(strongBreaststroker, 'breast')).toBe(88)
  })
})

describe('computeBasePace', () => {
  it('applies the spec formula (T400 - T200) / 2', () => {
    expect(computeBasePace(360, 170)).toBe(95)
  })

  it('defaults to the 400/200 protocol', () => {
    expect(computeBasePace(360, 170)).toBe(computeBasePace(360, 170, '400/200'))
  })

  it('uses the full difference for the youth 200/100 protocol', () => {
    // A 200 in 3:00 and a 100 in 1:25 means the second 100 took 1:35.
    expect(computeBasePace(180, 85, '200/100')).toBe(95)
  })

  it.each([
    [170, 360],
    [200, 200],
  ])('rejects a long swim of %is against a short swim of %is', (long, short) => {
    expect(() => computeBasePace(long, short)).toThrow(RangeError)
  })
})
