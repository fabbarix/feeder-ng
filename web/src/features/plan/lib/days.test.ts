import { describe, expect, it } from 'vitest'
import type { PlanSlot } from '../types'
import { groupByDay, nextMeal } from './days'

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
