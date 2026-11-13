import { describe, expect, it } from 'vitest'
import type { PlanSlot, PlannedMeal } from '../types'
import { dateRange, dayOverline, groupByDay, heroMeal, nextMeal } from './days'

type SlotOver = Partial<PlanSlot> & { meal?: PlannedMeal | null }

// A slot as the server sends it: one main Course row carries the Planned Meal.
function slot(date: string, id: number, time: string, over: SlotOver = {}): PlanSlot {
  const { meal: m = null, ...rest } = over
  return {
    date, mealSlotId: id, name: id === 1 ? 'Lunch' : 'Dinner', time, at: `${date}T${time}:00Z`, portions: 2, rules: [],
    courses: [{ courseId: 1, name: 'Main', main: true, optional: false, optOutMemberIds: [], meal: m, unfilled: null, coveredBy: null, unserved: null }],
    ...rest,
  }
}

const meal = (date: string, id: number, state: 'planned' | 'cooked' | 'skipped' = 'planned') => ({
  date, mealSlotId: id, recipeId: 1, recipeName: 'Pasta', batches: 1, portions: 2, state, pinned: false, servedFromLeftover: null, why: [],
})

describe('groupByDay', () => {
  const slots = [
    slot('2026-11-11', 2, '19:00'),
    slot('2026-11-09', 2, '19:00'),
    slot('2026-11-09', 1, '12:30'),
    slot('2026-11-10', 2, '19:00'),
  ]

  it('groups by date, chronologically, with the slots of a day ordered by time', () => {
    const days = groupByDay(slots, '2026-11-09')
    expect(days.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
    expect(days[0]!.slots.map((s) => s.time)).toEqual(['12:30', '19:00'])
  })

  // ds-plan: today no longer spans (the old span tests are replaced by days.heading.test.ts).
  it('marks today', () => {
    expect(groupByDay(slots, '2026-11-09').map((d) => d.isToday)).toEqual([true, false, false])
  })

  it('the heading keeps Today / Tomorrow / Yesterday titles for the old title field', () => {
    const days = groupByDay([slot('2026-11-08', 2, '19:00'), ...slots, slot('2026-11-12', 2, '19:00')], '2026-11-09')
    expect(days.map((d) => d.title)).toEqual(['Yesterday', 'Today', 'Tomorrow', 'Wednesday', 'Thursday'])
  })

  it('labels: Today, Tomorrow, Yesterday, then the weekday and date', () => {
    const days = groupByDay([slot('2026-11-08', 2, '19:00'), ...slots], '2026-11-09')
    expect(days.map((d) => d.label)).toEqual(['Yesterday', 'Today', 'Tomorrow', 'Wed 11 Nov'])
  })

  it('crosses a month boundary', () => {
    const days = groupByDay([slot('2026-12-01', 2, '19:00')], '2026-11-30')
    expect(days[0]!.label).toBe('Tomorrow')
  })
})

describe('nextMeal', () => {
  const now = new Date('2026-11-09T13:00:00Z')

  it('is the first planned meal that has not started yet', () => {
    const slots = [
      slot('2026-11-09', 1, '12:30', { meal: meal('2026-11-09', 1) }), // already over
      slot('2026-11-09', 2, '19:00', { meal: meal('2026-11-09', 2) }),
      slot('2026-11-10', 2, '19:00', { meal: meal('2026-11-10', 2) }),
    ]
    expect(nextMeal(slots, now)?.mealSlotId).toBe(2)
    expect(nextMeal(slots, now)?.date).toBe('2026-11-09')
  })

  it('skips empty slots and meals that are already Cooked or skipped', () => {
    const slots = [
      slot('2026-11-09', 2, '19:00', { meal: meal('2026-11-09', 2, 'cooked') }),
      slot('2026-11-10', 1, '12:30'),
      slot('2026-11-10', 2, '19:00', { meal: meal('2026-11-10', 2) }),
    ]
    expect(nextMeal(slots, now)?.date).toBe('2026-11-10')
  })

  it('is null when nothing is left to cook', () => {
    expect(nextMeal([], now)).toBeNull()
  })
})

describe('groupByDay: title and overline (WP6)', () => {
  const days = groupByDay([slot('2026-11-08', 2, '19:00'), slot('2026-11-09', 2, '19:00'), slot('2026-11-10', 2, '19:00'), slot('2026-11-11', 2, '19:00')], '2026-11-09')

  it('the heading is Today, Tomorrow, Yesterday, otherwise the long weekday', () => {
    expect(days.map((d) => d.title)).toEqual(['Yesterday', 'Today', 'Tomorrow', 'Wednesday'])
  })

  it('every day has the date overline "WED 11"', () => {
    expect(days.map((d) => d.overline)).toEqual(['SUN 8', 'MON 9', 'TUE 10', 'WED 11'])
  })
})

describe('dayOverline', () => {
  it('short weekday in capitals and the day of the month', () => {
    expect(dayOverline('2026-11-11')).toBe('WED 11')
    expect(dayOverline('2026-12-01')).toBe('TUE 1')
  })
})

describe('dateRange', () => {
  it('within a month: 9 – 15 Nov', () => {
    expect(dateRange('2026-11-09', '2026-11-15')).toBe('9 – 15 Nov')
  })
  it('across months: 30 Nov – 6 Dec', () => {
    expect(dateRange('2026-11-30', '2026-12-06')).toBe('30 Nov – 6 Dec')
  })
  it('across years names both years', () => {
    expect(dateRange('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027')
  })
  it('one day', () => {
    expect(dateRange('2026-11-09', '2026-11-09')).toBe('9 Nov')
  })
})

describe('heroMeal (the Today hero)', () => {
  const at = (date: string, time: string) => `${date}T${time}:00Z`
  const planned = (date: string, id: number, time: string, state: 'planned' | 'cooked' | 'skipped' = 'planned') =>
    slot(date, id, time, { at: at(date, time), meal: meal(date, id, state) })

  it('is the next planned meal that has not started', () => {
    const slots = [planned('2026-11-10', 2, '19:00'), planned('2026-11-11', 2, '19:00')]
    expect(heroMeal(slots, new Date('2026-11-10T17:00:00Z'))?.date).toBe('2026-11-10')
  })

  it('stays the hero for two hours after the slot time (awaiting confirmation)', () => {
    const slots = [planned('2026-11-10', 2, '19:00'), planned('2026-11-11', 2, '19:00')]
    expect(heroMeal(slots, new Date('2026-11-10T20:30:00Z'))?.date).toBe('2026-11-10')
    expect(heroMeal(slots, new Date('2026-11-10T21:00:00Z'))?.date).toBe('2026-11-11')
  })

  it('skips Cooked, not cooked and empty slots', () => {
    const slots = [planned('2026-11-10', 1, '12:30', 'cooked'), slot('2026-11-10', 3, '15:00'), planned('2026-11-10', 2, '19:00', 'skipped'), planned('2026-11-11', 2, '19:00')]
    expect(heroMeal(slots, new Date('2026-11-10T13:00:00Z'))?.date).toBe('2026-11-11')
  })

  it('is null when nothing is left', () => {
    expect(heroMeal([], new Date('2026-11-10T13:00:00Z'))).toBeNull()
  })
})
