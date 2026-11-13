// B5-F1: "Mark it" opens the oldest slot among a Line's unconfirmed past meals.
import { describe, expect, it } from 'vitest'
import { makeLine, makePast } from '../testData'
import { lineEntry, markItTarget } from './lines'

describe('markItTarget', () => {
  it('is the date and Meal Slot of the meal', () => {
    expect(markItTarget([makePast({ date: '2026-11-03', mealSlotId: 3 })])).toEqual({ date: '2026-11-03', mealSlotId: 3 })
  })

  it('several Courses of one slot are one target', () => {
    expect(markItTarget([makePast({ courseName: 'Starter' }), makePast({ courseName: 'Main' })])).toEqual({ date: '2026-11-03', mealSlotId: 3 })
  })

  it('several slots: the oldest date first, then the lower Meal Slot id', () => {
    expect(markItTarget([makePast({ date: '2026-11-05', mealSlotId: 1 }), makePast({ date: '2026-11-04', mealSlotId: 9 }), makePast({ date: '2026-11-04', mealSlotId: 2 })])).toEqual({ date: '2026-11-04', mealSlotId: 2 })
  })

  it('none for no meals', () => {
    expect(markItTarget([])).toBeNull()
    expect(markItTarget(undefined)).toBeNull()
  })
})

describe('lineEntry markIt', () => {
  it('carries the target beside the hint', () => {
    expect(lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric').markIt).toEqual({ date: '2026-11-03', mealSlotId: 3 })
  })

  it('leaves the key out without unconfirmed past meals', () => {
    expect('markIt' in lineEntry(makeLine(), 'USD', 'metric')).toBe(false)
    expect('markIt' in lineEntry(makeLine({ pastPlannedMeals: [] }), 'USD', 'metric')).toBe(false)
  })
})
