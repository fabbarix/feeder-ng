import { describe, expect, it } from 'vitest'
import type { SlotLike } from '../types'
import { tomorrowSlots } from './tiles'

function slot(date: string, id: number, time: string, over: Partial<SlotLike> = {}): SlotLike {
  return {
    date, mealSlotId: id, name: id === 1 ? 'Lunch' : 'Dinner', time, at: `${date}T${time}:00Z`,
    meal: { recipeId: id, recipeName: `R${id}`, batches: 1, portions: 4, state: 'planned' }, ...over,
  }
}
const empty = (date: string, id: number, time: string) => slot(date, id, time, { meal: null, unfilled: { reason: 'no_attendance' } })

describe('tomorrowSlots (R13: the board shows what could not be planned, read-only)', () => {
  it('lists planned meals and meals the planner could not plan, in time order', () => {
    const slots = [slot('2026-11-10', 2, '19:00'), empty('2026-11-10', 1, '12:00'), slot('2026-11-11', 2, '19:00')]
    expect(tomorrowSlots(slots, '2026-11-09').map((s) => s.mealSlotId)).toEqual([1, 2])
  })

  it('leaves out cooked and skipped meals and slots with nothing planned and no reason', () => {
    const slots = [
      slot('2026-11-10', 2, '19:00', { meal: { recipeId: 2, recipeName: 'R2', batches: 1, portions: 4, state: 'cooked' } }),
      slot('2026-11-10', 3, '20:00', { meal: null, unfilled: null }),
      slot('2026-11-10', 4, '21:00', { meal: null }),
    ]
    expect(tomorrowSlots(slots, '2026-11-09')).toEqual([])
  })

  it('tomorrowMeals still lists only planned meals (Tonight and others rely on it)', async () => {
    const { tomorrowMeals } = await import('./tiles')
    expect(tomorrowMeals([empty('2026-11-10', 1, '12:00'), slot('2026-11-10', 2, '19:00')], '2026-11-09').map((s) => s.mealSlotId)).toEqual([2])
  })
})
