import { describe, expect, it } from 'vitest'
import { daysBetween, describeGoOff, sortTotals, USE_SOON_DAYS } from './view'
import { makeTotal } from '../testData'

const today = '2026-11-09'

describe('daysBetween', () => {
  it('counts whole days across month, year and leap-day boundaries', () => {
    expect(daysBetween('2026-11-09', '2026-11-12')).toBe(3)
    expect(daysBetween('2026-11-09', '2026-11-05')).toBe(-4)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2) // DST change in Europe
  })
})

describe('describeGoOff', () => {
  it.each([
    [null, 'No go-off date', 'neutral'],
    ['2026-11-08', 'Went off yesterday', 'spoil'],
    ['2026-11-05', 'Went off 4 days ago', 'spoil'],
    ['2026-11-09', 'Goes off today', 'spoil'],
    ['2026-11-10', 'Goes off tomorrow', 'spoil'],
    ['2026-11-12', 'Goes off in 3 days', 'spoil'],
    ['2026-11-13', 'Goes off in 4 days', 'neutral'],
    ['2026-11-30', 'Goes off in 21 days', 'neutral'],
  ] as const)('%s -> %s (%s)', (goesOff, label, tone) => {
    expect(describeGoOff(goesOff, today)).toEqual({ label, tone })
  })
  it('uses the same use-soon window as the server', () => {
    expect(USE_SOON_DAYS).toBe(3)
  })
})

describe('sortTotals', () => {
  it('puts spoiled first, then use-soon, then by name, without mutating', () => {
    const items = [
      makeTotal({ ingredientId: 1, name: 'milk' }),
      makeTotal({ ingredientId: 2, name: 'eggs', useSoon: true }),
      makeTotal({ ingredientId: 3, name: 'chicken', spoiledCount: 1, useSoon: true }),
      makeTotal({ ingredientId: 4, name: 'Butter' }),
    ]
    const copy = [...items]
    expect(sortTotals(items).map((i) => i.name)).toEqual(['chicken', 'eggs', 'Butter', 'milk'])
    expect(items).toEqual(copy)
  })
})
