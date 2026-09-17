import { describe, expect, it } from 'vitest'
import { formatSendOff, roundToNearest25 } from './units'

describe('roundToNearest25', () => {
  it.each([
    [0, 0],
    [12, 0],
    [13, 25],
    [37, 25],
    [38, 50],
    [100, 100],
    [112, 100],
    [1234, 1225],
  ])('rounds %i to %i', (input, expected) => {
    expect(roundToNearest25(input)).toBe(expected)
  })
})

describe('formatSendOff', () => {
  it.each([
    [90, '1:30'],
    [60, '1:00'],
    [65, '1:05'],
    [59, '0:59'],
    [125.4, '2:05'],
  ])('formats %s seconds as %s', (input, expected) => {
    expect(formatSendOff(input)).toBe(expected)
  })
})
