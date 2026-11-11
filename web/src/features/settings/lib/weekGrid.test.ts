import { describe, expect, it } from 'vitest'
import type { MealSlot } from '../types'
import { weekGrid } from './weekGrid'

const s = (id: number, weekday: number, name: string, time: string): MealSlot => ({ id, weekday, name, time, attendance: [], portionsNeeded: 0 })
const slots = [s(1, 2, 'Dinner', '19:30'), s(2, 1, 'dinner', '19:00'), s(3, 1, 'Lunch', '12:30'), s(4, 6, 'Brunch', '11:00'), s(5, 1, 'Breakfast', '07:30')]

describe('weekGrid: days as columns, Meal Slot names as rows', () => {
  it('has seven day columns, Monday first', () => {
    expect(weekGrid(slots).days).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(weekGrid(slots, 7).days).toEqual([7, 1, 2, 3, 4, 5, 6])
  })
  it('rows are names (case-insensitive) ordered by their earliest usual time, then name', () => {
    expect(weekGrid(slots).rows.map((r) => r.name)).toEqual(['Breakfast', 'Brunch', 'Lunch', 'Dinner'])
  })
  it('cells follow the day order and are null where the day has no such slot', () => {
    const dinner = weekGrid(slots).rows.find((r) => r.name === 'Dinner')!
    expect(dinner.cells.map((c) => c?.id ?? null)).toEqual([2, 1, null, null, null, null, null])
    const sundayFirst = weekGrid(slots, 7).rows.find((r) => r.name === 'Dinner')!
    expect(sundayFirst.cells.map((c) => c?.id ?? null)).toEqual([null, 2, 1, null, null, null, null])
  })
  it('no slots, no rows', () => expect(weekGrid([]).rows).toEqual([]))
})
