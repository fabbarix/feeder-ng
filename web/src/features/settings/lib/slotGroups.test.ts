import { describe, expect, it } from 'vitest'
import type { MealSlot } from '../types'
import { groupByWeekday } from './slotGroups'

const slot = (id: number, weekday: number, name: string, time: string): MealSlot => ({ id, weekday, name, time, attendance: [], portionsNeeded: 0 })

describe('groupByWeekday', () => {
  it('orders weekdays, sorts by time and skips empty days', () => {
    const groups = groupByWeekday([slot(1, 4, 'Dinner', '19:00'), slot(2, 1, 'Lunch', '12:30'), slot(3, 4, 'Lunch', '12:00')])
    expect(groups.map((g) => g.name)).toEqual(['Monday', 'Thursday'])
    expect(groups[1]!.slots.map((s) => s.id)).toEqual([3, 1])
  })

  it('is empty without slots', () => expect(groupByWeekday([])).toEqual([]))
})
