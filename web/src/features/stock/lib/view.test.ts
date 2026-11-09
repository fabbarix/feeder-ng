import { describe, expect, it } from 'vitest'
import * as view from './view'
import { daysBetween, describeGoOff, sortTotals } from './view'
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
  const flags = (spoiled: boolean, useSoon: boolean) => ({ spoiled, useSoon })
  it.each([
    [null, flags(false, false), 'No go-off date', 'neutral'],
    ['2026-11-08', flags(true, false), 'Went off yesterday', 'spoil'],
    ['2026-11-05', flags(true, false), 'Went off 4 days ago', 'spoil'],
    ['2026-11-09', flags(false, true), 'Goes off today', 'spoil'],
    ['2026-11-10', flags(false, true), 'Goes off tomorrow', 'spoil'],
    ['2026-11-12', flags(false, true), 'Goes off in 3 days', 'spoil'],
    ['2026-11-13', flags(false, false), 'Goes off in 4 days', 'neutral'],
    ['2026-11-30', flags(false, false), 'Goes off in 21 days', 'neutral'],
  ] as const)('%s with %j -> %s (%s)', (goesOff, f, label, tone) => {
    expect(describeGoOff({ goesOff, ...f }, today)).toEqual({ label, tone })
  })

  it('takes the tone from the server flags, not from the dates', () => {
    // Tomorrow, but the server says it is not use soon: neutral. Far away but flagged: spoil.
    expect(describeGoOff({ goesOff: '2026-11-10', spoiled: false, useSoon: false }, today).tone).toBe('neutral')
    expect(describeGoOff({ goesOff: '2026-12-25', spoiled: false, useSoon: true }, today).tone).toBe('spoil')
    expect(describeGoOff({ goesOff: '2026-11-01', spoiled: false, useSoon: false }, today).tone).toBe('neutral')
  })

  it('does not keep its own copy of the use-soon rule', () => {
    expect('USE_SOON_DAYS' in view).toBe(false)
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
