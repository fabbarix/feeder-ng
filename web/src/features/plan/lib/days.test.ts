import { describe, expect, it } from 'vitest'
import type { PlanSlot } from '../types'
import { dateRange, dayOverline, groupByDay, heroMeal, nextMeal } from './days'

function slot(date: string, id: number, time: string, over: Partial<PlanSlot> = {}): PlanSlot {
  return { date, mealSlotId: id, name: id === 1 ? 'Lunch' : 'Dinner', time, at: `${date}T${time}:00Z`, portions: 2, meal: null, unfilled: null, rules: [], ...over }
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

  it('today spans both columns of the grid, other days one', () => {
    const days = groupByDay(slots, '2026-11-09')
    expect(days.map((d) => d.span)).toEqual([2, 1, 1])
    expect(days.map((d) => d.isToday)).toEqual([true, false, false])
  })

  it('at 7 columns (a true week) today spans ONE column; at 2 and 4 it still spans two', () => {
    expect(groupByDay(slots, '2026-11-09', 7).map((d) => d.span)).toEqual([1, 1, 1])
    expect(groupByDay(slots, '2026-11-09', 7).map((d) => d.isToday)).toEqual([true, false, false])
    expect(groupByDay(slots, '2026-11-09', 4).map((d) => d.span)).toEqual([2, 1, 1])
    expect(groupByDay(slots, '2026-11-09', 2).map((d) => d.span)).toEqual([2, 1, 1])
  })

  it('shortTitle keeps Today / Tomorrow / Yesterday and shortens other weekdays ("Wed"), so a 7-column heading never clips', () => {
    const days = groupByDay([slot('2026-11-08', 2, '19:00'), ...slots, slot('2026-11-12', 2, '19:00')], '2026-11-09')
    expect(days.map((d) => d.shortTitle)).toEqual(['Yesterday', 'Today', 'Tomorrow', 'Wed', 'Thu'])
    expect(days.map((d) => d.title)).toEqual(['Yesterday', 'Today', 'Tomorrow', 'Wednesday', 'Thursday'])
  })

  it('without a slot today nothing spans two columns', () => {
    const days = groupByDay(slots.slice(0, 1), '2026-11-09')
    expect(days.map((d) => d.span)).toEqual([1])
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
