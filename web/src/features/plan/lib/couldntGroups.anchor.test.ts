import { describe, expect, it } from 'vitest'
import type { PlanSlot } from '../types'
import { groupByCause } from './couldntGroups'

const nobody = (date: string, mealSlotId: number): PlanSlot => ({
  date, mealSlotId, name: 'Dinner', time: '19:00', at: `${date}T19:00:00Z`, portions: 0, meal: null, rules: [],
  unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } },
})

describe('R15: "Choose who attends" deep-links to the first affected Meal Slot', () => {
  it('goes to /settings/meal-slots#meal-slot-<id> of the earliest affected slot', () => {
    const [g] = groupByCause([nobody('2026-11-12', 11), nobody('2026-11-10', 10)])
    expect(g!.fix).toEqual({ kind: 'link', label: 'Choose who attends', to: '/settings/meal-slots#meal-slot-10' })
  })
})
