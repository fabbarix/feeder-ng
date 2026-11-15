// RX-08 (B9-16): Lead time and Duration are shown in min, h or d; the draft keeps whole minutes. Pure functions, no React.
import { describe, expect, it } from 'vitest'
import { fromMinutes, splitMinutes, toMinutes, UNIT_MINUTES } from './duration'

describe('UNIT_MINUTES', () => {
  it('is 1, 60 and 1440 minutes', () => {
    expect(UNIT_MINUTES).toEqual({ min: 1, h: 60, d: 1440 })
  })
})

describe('splitMinutes picks the largest unit that divides the minutes evenly', () => {
  it.each([
    [0, { value: 0, unit: 'min' }],
    [1, { value: 1, unit: 'min' }],
    [45, { value: 45, unit: 'min' }],
    [60, { value: 1, unit: 'h' }],
    [90, { value: 90, unit: 'min' }], // 1.5 h is not whole, so it stays in minutes
    [120, { value: 2, unit: 'h' }],
    [360, { value: 6, unit: 'h' }],
    [720, { value: 12, unit: 'h' }],
    [1440, { value: 1, unit: 'd' }],
    [2880, { value: 2, unit: 'd' }],
    [1500, { value: 25, unit: 'h' }], // not a whole number of days, a whole number of hours
  ] as const)('%d min is %j', (minutes, expected) => {
    expect(splitMinutes(minutes)).toEqual(expected)
  })

  it('never offers a unit the field does not have: Duration has min and h only, so a day is 24 h', () => {
    expect(splitMinutes(1440, ['min', 'h'])).toEqual({ value: 24, unit: 'h' })
    expect(splitMinutes(2880, ['min', 'h'])).toEqual({ value: 48, unit: 'h' })
    expect(splitMinutes(90, ['min'])).toEqual({ value: 90, unit: 'min' })
  })

  it('treats a negative or non-finite amount as 0 min', () => {
    expect(splitMinutes(-5)).toEqual({ value: 0, unit: 'min' })
    expect(splitMinutes(Number.NaN)).toEqual({ value: 0, unit: 'min' })
  })
})

describe('toMinutes', () => {
  it.each([
    [90, 'min', 90],
    [12, 'h', 720],
    [1, 'd', 1440],
    [1.5, 'h', 90],
    [0.5, 'd', 720],
    [0, 'h', 0],
  ] as const)('%d %s is %d min', (value, unit, minutes) => {
    expect(toMinutes(value, unit)).toBe(minutes)
  })

  it('rounds to whole minutes (the draft and the API keep whole minutes)', () => {
    expect(toMinutes(0.01, 'h')).toBe(1) // 0.6 min
    expect(toMinutes(1.6666, 'h')).toBe(100)
    expect(toMinutes(2.4, 'min')).toBe(2)
  })

  it('is never negative', () => {
    expect(toMinutes(-3, 'h')).toBe(0)
  })
})

describe('fromMinutes (the number shown when the unit changes)', () => {
  it.each([
    [720, 'min', 720],
    [720, 'h', 12],
    [90, 'h', 1.5],
    [1440, 'd', 1],
    [100, 'h', 1.67], // at most 2 decimals
    [60, 'd', 0.04],
  ] as const)('%d min shown in %s is %d', (minutes, unit, shown) => {
    expect(fromMinutes(minutes, unit)).toBe(shown)
  })
})

describe('round trips', () => {
  it.each([90, 720, 1440, 1, 45, 360, 1500, 0])('%d min -> split -> toMinutes is unchanged', (minutes) => {
    const { value, unit } = splitMinutes(minutes)
    expect(toMinutes(value, unit)).toBe(minutes)
  })

  it('1.5 h typed in is 90 min and reads back as 90 min', () => {
    const minutes = toMinutes(1.5, 'h')
    expect(minutes).toBe(90)
    expect(splitMinutes(minutes)).toEqual({ value: 90, unit: 'min' })
  })

  it('switching the unit keeps the minutes: 12 h shown as min is 720', () => {
    expect(fromMinutes(toMinutes(12, 'h'), 'min')).toBe(720)
  })
})
