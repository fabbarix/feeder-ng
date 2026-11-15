// B9-40 (PC-12): the last Step of a meal on a future date explains itself. Dates: the household's today is Sun 15 Nov 2026.
import { describe, expect, it } from 'vitest'
import { dayLabel, dayTitle, futureLine, isFutureMeal } from './future'

const TODAY = '2026-11-15'

describe('isFutureMeal', () => {
  it('tomorrow and later are future, today and earlier are not', () => {
    expect(isFutureMeal('2026-11-16', TODAY)).toBe(true)
    expect(isFutureMeal('2026-12-01', TODAY)).toBe(true)
    expect(isFutureMeal(TODAY, TODAY)).toBe(false)
    expect(isFutureMeal('2026-11-14', TODAY)).toBe(false)
  })
  it('an unknown today (still loading) is not future: nothing is hidden on a guess', () => {
    expect(isFutureMeal('2026-11-16', '')).toBe(false)
  })
})

describe('dayLabel', () => {
  it('is the short weekday and the day of the month', () => {
    expect(dayLabel('2026-11-16')).toBe('Mon 16')
    expect(dayLabel('2026-11-18')).toBe('Wed 18')
    expect(dayLabel('2026-12-01')).toBe('Tue 1')
  })
})

describe('futureLine (the held line of the last Step; PC-12 copy)', () => {
  it('tomorrow says "tomorrow" and names the day to mark it from', () => {
    expect(futureLine('2026-11-16', TODAY)).toBe('This meal is for tomorrow. Mark it Cooked from Mon 16, on Today or the Plan.')
  })
  it('a later date names the day twice', () => {
    expect(futureLine('2026-11-18', TODAY)).toBe('This meal is for Wed 18. Mark it Cooked from Wed 18, on Today or the Plan.')
  })
  it('tomorrow across a month end is still tomorrow', () => {
    expect(futureLine('2026-12-01', '2026-11-30')).toBe('This meal is for tomorrow. Mark it Cooked from Tue 1, on Today or the Plan.')
  })
  it('a meal that may be marked has no line', () => {
    expect(futureLine(TODAY, TODAY)).toBe('')
    expect(futureLine('2026-11-14', TODAY)).toBe('')
  })
})

describe('dayTitle (the header names the day for a future meal, today\'s keeps its name)', () => {
  it('a future Dinner is "Mon 16 Dinner"', () => {
    expect(dayTitle('Dinner', '2026-11-16', TODAY)).toBe('Mon 16 Dinner')
  })
  it('today\'s and a past Dinner stay "Dinner"', () => {
    expect(dayTitle('Dinner', TODAY, TODAY)).toBe('Dinner')
    expect(dayTitle('Dinner', '2026-11-14', TODAY)).toBe('Dinner')
  })
})
