import { describe, expect, it } from 'vitest'
import type { LeftoverLike, SlotLike, StockTotalLike } from '../types'
import { clockText, dateText, dueText, leftoverRows, msUntil, startCookPath, tomorrowMeals, tonightMeal, useSoonRows } from './tiles'

function slot(date: string, id: number, at: string, state: 'planned' | 'cooked' | 'skipped' | null = 'planned', recipe = `R${id}`): SlotLike {
  return { date, mealSlotId: id, name: id === 1 ? 'Lunch' : 'Dinner', time: at.slice(11, 16), at, meal: state ? { recipeId: id, recipeName: recipe, batches: 1, portions: 4, state } : null }
}

const NOW = '2026-11-09T17:00:00Z'

describe('tonightMeal', () => {
  it('picks the next planned meal of today', () => {
    const slots = [slot('2026-11-09', 1, '2026-11-09T12:00:00Z'), slot('2026-11-09', 2, '2026-11-09T19:00:00Z'), slot('2026-11-10', 2, '2026-11-10T19:00:00Z')]
    expect(tonightMeal(slots, '2026-11-09', NOW)?.mealSlotId).toBe(2)
  })

  it('keeps a meal that started less than two hours ago', () => {
    const slots = [slot('2026-11-09', 2, '2026-11-09T15:30:00Z')]
    expect(tonightMeal(slots, '2026-11-09', NOW)?.mealSlotId).toBe(2)
    expect(tonightMeal(slots, '2026-11-09', '2026-11-09T17:31:00Z')).toBeNull()
  })

  it('ignores cooked, skipped and empty slots and other days', () => {
    const slots = [slot('2026-11-09', 2, '2026-11-09T19:00:00Z', 'cooked'), slot('2026-11-09', 3, '2026-11-09T20:00:00Z', 'skipped'), slot('2026-11-09', 4, '2026-11-09T21:00:00Z', null), slot('2026-11-10', 2, '2026-11-10T19:00:00Z')]
    expect(tonightMeal(slots, '2026-11-09', NOW)).toBeNull()
  })

  it('breaks time ties by Meal Slot id', () => {
    const slots = [slot('2026-11-09', 5, '2026-11-09T19:00:00Z'), slot('2026-11-09', 2, '2026-11-09T19:00:00Z')]
    expect(tonightMeal(slots, '2026-11-09', NOW)?.mealSlotId).toBe(2)
  })
})

describe('tomorrowMeals', () => {
  it('lists the planned meals of the next day in time order', () => {
    const slots = [
      slot('2026-11-10', 2, '2026-11-10T19:00:00Z'),
      slot('2026-11-10', 1, '2026-11-10T12:00:00Z'),
      slot('2026-11-10', 3, '2026-11-10T20:00:00Z', 'skipped'),
      slot('2026-11-11', 2, '2026-11-11T19:00:00Z'),
      slot('2026-11-09', 2, '2026-11-09T19:00:00Z'),
    ]
    expect(tomorrowMeals(slots, '2026-11-09').map((s) => s.mealSlotId)).toEqual([1, 2])
  })

  it('crosses month and year ends', () => {
    const slots = [slot('2027-01-01', 2, '2027-01-01T19:00:00Z')]
    expect(tomorrowMeals(slots, '2026-12-31')).toHaveLength(1)
    expect(tomorrowMeals([slot('2026-12-01', 2, '2026-12-01T19:00:00Z')], '2026-11-30')).toHaveLength(1)
  })
})

describe('leftoverRows', () => {
  const lo = (id: number, name: string, portions: number, useBy: string): LeftoverLike => ({ id, recipeId: id, recipeName: name, portions, useBy })
  it('lists the soonest Use-by first and drops empty ones', () => {
    const rows = leftoverRows([lo(1, 'Stew', 2, '2026-11-12'), lo(2, 'Chili', 3, '2026-11-10'), lo(3, 'Soup', 0, '2026-11-09'), lo(4, 'Bake', 1, '2026-11-10')], 10)
    expect(rows.map((r) => r.recipeName)).toEqual(['Bake', 'Chili', 'Stew'])
  })
  it('caps the list', () => {
    expect(leftoverRows([lo(1, 'a', 1, '2026-11-10'), lo(2, 'b', 1, '2026-11-11'), lo(3, 'c', 1, '2026-11-12')], 2)).toHaveLength(2)
  })
})

describe('useSoonRows', () => {
  const t = (id: number, name: string, useSoon: boolean, nextGoesOff: string | null, spoiledCount = 0): StockTotalLike => ({ ingredientId: id, name, baseUnit: 'g', total: 100, nextGoesOff, useSoon, spoiledCount })
  it('keeps the use-soon ones, soonest go-off first', () => {
    const rows = useSoonRows([t(1, 'milk', true, '2026-11-11'), t(2, 'rice', false, null), t(3, 'chicken', true, '2026-11-10'), t(4, 'apples', true, '2026-11-10')], 10)
    expect(rows.map((r) => r.name)).toEqual(['apples', 'chicken', 'milk'])
  })
  it('does not list ingredients that are only spoiled', () => {
    expect(useSoonRows([t(1, 'fish', false, '2026-11-01', 1)], 5)).toEqual([])
  })
  it('caps the list', () => {
    expect(useSoonRows([t(1, 'a', true, '2026-11-10'), t(2, 'b', true, '2026-11-10')], 1)).toHaveLength(1)
  })
})

describe('time text', () => {
  const instant = new Date('2026-11-09T17:42:00Z')
  it('shows the clock in the household zone', () => {
    expect(clockText(instant, 'Europe/Rome')).toBe('18:42')
    expect(clockText(instant, 'America/New_York')).toBe('12:42')
    expect(clockText(new Date('2026-11-09T23:05:00Z'), 'UTC')).toBe('23:05')
    expect(clockText(new Date('2026-11-09T00:05:00Z'), 'UTC')).toBe('00:05')
  })
  it('shows the long date in the zone', () => {
    expect(dateText(instant, 'Europe/Rome')).toBe('Monday 9 November')
    expect(dateText(new Date('2026-11-09T23:30:00Z'), 'Europe/Rome')).toBe('Tuesday 10 November')
  })
  it('msUntil is never negative and capped at a day', () => {
    const now = Date.parse('2026-11-09T18:00:00Z')
    expect(msUntil('2026-11-09T18:00:30Z', now)).toBe(30_000)
    expect(msUntil('2026-11-09T17:00:00Z', now)).toBe(0)
    expect(msUntil('2026-12-25T00:00:00Z', now)).toBe(24 * 3600 * 1000)
    expect(msUntil('not a date', now)).toBe(0)
  })
  it('dueText says how soon', () => {
    const now = Date.parse('2026-11-09T18:00:00Z')
    expect(dueText('2026-11-09T21:00:00Z', now)).toBe('in 3 h')
    expect(dueText('2026-11-09T18:45:00Z', now)).toBe('in 45 min')
    expect(dueText('2026-11-09T18:00:30Z', now)).toBe('now')
    expect(dueText('2026-11-09T12:00:00Z', now)).toBe('now')
    expect(dueText('2026-11-10T17:59:00Z', now)).toBe('in 23 h')
  })

  // R11b N7: 24 h or more ahead the board says the day and time ("Sat 11:30") in the household zone, not "in 92 h".
  describe('dueText beyond 24 h (N7)', () => {
    const rome = 'Europe/Rome'
    const now = Date.parse('2026-11-09T18:00:00Z') // Mon 19:00 in Rome (CET)
    it('stays relative just under 24 h', () => {
      expect(dueText('2026-11-10T17:59:59Z', now, rome)).toBe('in 23 h')
    })
    it('is the weekday and time from exactly 24 h', () => {
      expect(dueText('2026-11-10T18:00:00Z', now, rome)).toBe('Tue 19:00')
    })
    it('four days ahead reads "Fri 15:00", in the household zone', () => {
      expect(dueText('2026-11-13T14:00:00Z', now, rome)).toBe('Fri 15:00')
    })
    it('uses the zone for the day change: 23:30 UTC is already the next day in Rome', () => {
      expect(dueText('2026-11-14T23:30:00Z', now, rome)).toBe('Sun 00:30')
      expect(dueText('2026-11-14T23:30:00Z', now, 'UTC')).toBe('Sat 23:30')
    })
    it('is 24-hour with a leading zero', () => {
      expect(dueText('2026-11-11T06:05:00Z', now, 'UTC')).toBe('Wed 06:05')
    })
    it('is DST-safe: the clocks go back in Rome on Sun 25 Oct 2026 03:00, the wall time stays right', () => {
      const sat = Date.parse('2026-10-24T09:00:00Z') // Sat 11:00 CEST
      expect(dueText('2026-10-25T09:00:00Z', sat, rome)).toBe('Sun 10:00') // 24 h later is 10:00 CET
      expect(dueText('2026-10-26T10:30:00Z', sat, rome)).toBe('Mon 11:30')
    })
    it('is DST-safe: the clocks go forward on Sun 29 Mar 2026 02:00', () => {
      const sat = Date.parse('2026-03-28T10:00:00Z') // Sat 11:00 CET
      expect(dueText('2026-03-29T10:00:00Z', sat, rome)).toBe('Sun 12:00') // 24 h later is 12:00 CEST
    })
    it('"now" and minutes are unchanged', () => {
      expect(dueText('2026-11-09T18:20:00Z', now, rome)).toBe('in 20 min')
      expect(dueText('2026-11-09T17:00:00Z', now, rome)).toBe('now')
    })
  })
})

describe('startCookPath', () => {
  it("goes to tonight's meal", () => {
    const slots = [slot('2026-11-09', 2, '2026-11-09T19:00:00Z'), slot('2026-11-10', 2, '2026-11-10T19:00:00Z')]
    expect(startCookPath(slots, '2026-11-09', NOW)).toBe('/cook/meal/2026-11-09/2')
  })
  it('falls back to the next planned meal on a later day', () => {
    const slots = [slot('2026-11-09', 2, '2026-11-09T09:00:00Z', 'cooked'), slot('2026-11-11', 3, '2026-11-11T19:00:00Z'), slot('2026-11-10', 2, '2026-11-10T19:00:00Z')]
    expect(startCookPath(slots, '2026-11-09', NOW)).toBe('/cook/meal/2026-11-10/2')
  })
  it('is null when nothing is planned', () => {
    expect(startCookPath([], '2026-11-09', NOW)).toBeNull()
    expect(startCookPath([slot('2026-11-09', 2, '2026-11-09T19:00:00Z', 'skipped')], '2026-11-09', NOW)).toBeNull()
  })
})
