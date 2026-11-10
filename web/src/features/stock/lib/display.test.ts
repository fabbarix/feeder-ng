import { describe, expect, it } from 'vitest'
import { capitalise, formatLotDate } from './display'

describe('formatLotDate (en-GB day and short month)', () => {
  it.each([
    ['2026-11-05', '5 Nov'],
    ['2026-01-31', '31 Jan'],
    ['2026-12-01', '1 Dec'],
  ])('%s -> %s', (iso, text) => {
    expect(formatLotDate(iso)).toBe(text)
  })

  it('does not shift the day with the time zone', () => {
    expect(formatLotDate('2026-03-01')).toBe('1 Mar')
  })
})

describe('capitalise (display only)', () => {
  it.each([
    ['chicken thighs', 'Chicken thighs'],
    ['milk', 'Milk'],
    ['Eggs', 'Eggs'],
    ['', ''],
  ])('%j -> %j', (input, out) => {
    expect(capitalise(input)).toBe(out)
  })

  it('only changes the first letter and leaves the rest as typed', () => {
    expect(capitalise('free-range EGGS')).toBe('Free-range EGGS')
  })
})
