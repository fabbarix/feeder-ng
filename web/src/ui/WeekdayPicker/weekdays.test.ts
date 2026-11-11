import { describe, expect, it } from 'vitest'
import { sortIsoDays, weekdayLongName, weekdayOrder, weekdayShortName } from './weekdays'

describe('weekdays (ISO 1 Monday .. 7 Sunday)', () => {
  it('starts on Monday by default and can start on Sunday or Saturday', () => {
    expect(weekdayOrder()).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(weekdayOrder(7)).toEqual([7, 1, 2, 3, 4, 5, 6])
    expect(weekdayOrder(6)).toEqual([6, 7, 1, 2, 3, 4, 5])
  })
  it('gives short and full names for the locale', () => {
    expect([1, 4, 7].map((d) => weekdayShortName(d))).toEqual(['Mon', 'Thu', 'Sun'])
    expect(weekdayLongName(3)).toBe('Wednesday')
    expect(weekdayShortName(1, 'it').toLowerCase()).toBe('lun')
    expect(weekdayLongName(1, 'it').toLowerCase()).toBe('lunedì')
  })
  it('sorts ascending, de-duplicates and drops values outside 1..7', () => {
    expect(sortIsoDays([5, 1, 5, 0, 8, 3])).toEqual([1, 3, 5])
  })
})
