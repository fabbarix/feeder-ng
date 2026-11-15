// SET-15: the Removed Meal Slots rows. R-E: key "Snack · Mon to Fri", value "6 Cooked", detail "16:30 · removed 14 Nov".
import { describe, expect, it } from 'vitest'
import { historyLabel, removedDaysLabel, removedMealSlotRows, type RemovedMealSlotGroup } from './removedMealSlots'

const group = (over: Partial<RemovedMealSlotGroup> = {}): RemovedMealSlotGroup => ({
  ids: [41, 42, 43, 44, 45], name: 'Snack', weekdays: [1, 2, 3, 4, 5], time: '16:30', removedAt: '2026-11-14T12:00:00Z', cookedCount: 6, notCookedCount: 0, ...over,
})

// The user chose (B9-42): the counts read apart; the combined form is gone.
describe('historyLabel: the counts read apart', () => {
  it('"12 Cooked · 3 Not cooked"', () => {
    expect(historyLabel({ cookedCount: 12, notCookedCount: 3 })).toBe('12 Cooked \u00b7 3 Not cooked')
  })
  it('a zero count is left out, not shown as "0 Not cooked"', () => {
    expect(historyLabel({ cookedCount: 6, notCookedCount: 0 })).toBe('6 Cooked')
    expect(historyLabel({ cookedCount: 0, notCookedCount: 3 })).toBe('3 Not cooked')
  })
})

describe('removedDaysLabel', () => {
  it('a run of three or more days is "Mon to Fri"', () => {
    expect(removedDaysLabel([1, 2, 3, 4, 5])).toBe('Mon to Fri')
    expect(removedDaysLabel([5, 6, 7])).toBe('Fri to Sun')
  })
  it('one day is its short name, two days are listed', () => {
    expect(removedDaysLabel([7])).toBe('Sun')
    expect(removedDaysLabel([1, 2])).toBe('Mon, Tue')
  })
  it('days with a gap are listed', () => {
    expect(removedDaysLabel([1, 3, 5])).toBe('Mon, Wed, Fri')
  })
  it('all seven is "Every day"', () => {
    expect(removedDaysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Every day')
  })
})

describe('removedMealSlotRows', () => {
  it('one row per group: key "Snack \u00b7 Mon to Fri", detail "16:30 \u00b7 removed 14 Nov", value "6 Cooked"', () => {
    const [row] = removedMealSlotRows([group()], 'en')
    expect(row).toMatchObject({ name: 'Snack', title: 'Snack \u00b7 Mon to Fri', detail: '16:30 \u00b7 removed 14 Nov', value: '6 Cooked', ids: [41, 42, 43, 44, 45] })
  })
  it('names the button after the whole row, so two Put back buttons are never the same', () => {
    const rows = removedMealSlotRows([group(), group({ ids: [51], name: 'Brunch', weekdays: [7], time: '11:00', removedAt: '2026-11-02T12:00:00Z', cookedCount: 3 })], 'en')
    expect(rows.map((r) => r.putBackLabel)).toEqual(['Put back Snack \u00b7 Mon to Fri', 'Put back Brunch \u00b7 Sun'])
  })
  it('sorts newest removal first', () => {
    const rows = removedMealSlotRows([group({ name: 'Brunch', removedAt: '2026-11-02T12:00:00Z', ids: [7] }), group({ name: 'Snack' })], 'en')
    expect(rows.map((r) => r.name)).toEqual(['Snack', 'Brunch'])
  })
  it('has a stable key from the ids', () => {
    expect(removedMealSlotRows([group({ ids: [3, 4] })], 'en')[0]!.key).toBe('3-4')
  })
  it('is empty for no groups', () => {
    expect(removedMealSlotRows([], 'en')).toEqual([])
  })
  it('uses the history formatter for the value', () => {
    expect(removedMealSlotRows([group({ cookedCount: 12, notCookedCount: 3 })], 'en')[0]!.value).toBe(historyLabel({ cookedCount: 12, notCookedCount: 3 }))
  })
})
