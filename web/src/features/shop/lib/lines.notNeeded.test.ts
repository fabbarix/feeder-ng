import { describe, expect, it } from 'vitest'
import { makeLine, makeList, makePast } from '../testData'
import { lineEntry, listEntries, notNeededEntries, pastMealsHint } from './lines'

// B5-SH: the hint of a Line with unconfirmed past meals, and the entries of the Not needed group.
// 2026-11-02 is a Monday, 11-03 a Tuesday, 11-04 a Wednesday.

describe('pastMealsHint', () => {
  it('is empty without unconfirmed past meals', () => {
    expect(pastMealsHint(undefined)).toBe('')
    expect(pastMealsHint([])).toBe('')
  })

  it('names one slot by its weekday and Meal Slot', () => {
    expect(pastMealsHint([makePast()])).toBe('Includes Tue Dinner, not marked Cooked yet')
  })

  it('groups the Courses of one slot instead of repeating the slot', () => {
    expect(pastMealsHint([makePast({ courseName: 'Starter' }), makePast({ courseName: 'Side' })])).toBe('Includes Tue Dinner (Starter, Side), not marked Cooked yet')
  })

  it('lists two slots with "and", in the order given', () => {
    expect(pastMealsHint([makePast(), makePast({ date: '2026-11-04', mealSlotId: 2, mealSlotName: 'Lunch' })])).toBe('Includes Tue Dinner and Wed Lunch, not marked Cooked yet')
  })

  it('lists three slots with commas and a last "and"', () => {
    const meals = [makePast({ date: '2026-11-02' }), makePast(), makePast({ date: '2026-11-04', mealSlotId: 2, mealSlotName: 'Lunch' })]
    expect(pastMealsHint(meals)).toBe('Includes Mon Dinner, Tue Dinner and Wed Lunch, not marked Cooked yet')
  })

  it('tells two Dinners on different days apart from one slot with two Courses', () => {
    const meals = [makePast({ courseName: 'Starter' }), makePast({ date: '2026-11-04', courseName: 'Starter' })]
    expect(pastMealsHint(meals)).toBe('Includes Tue Dinner and Wed Dinner, not marked Cooked yet')
  })

  it('uses no word the glossary forbids (skip, dismiss, hide)', () => {
    expect(pastMealsHint([makePast()])).not.toMatch(/skip|dismiss|hide/i)
  })
})

describe('lineEntry hint', () => {
  it('carries the hint of a Line with unconfirmed past meals', () => {
    expect(lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric').hint).toBe('Includes Tue Dinner, not marked Cooked yet')
  })

  it('leaves the key out when there is nothing to say (older saved lists included)', () => {
    expect('hint' in lineEntry(makeLine({ pastPlannedMeals: [] }), 'USD', 'metric')).toBe(false)
    expect('hint' in lineEntry(makeLine(), 'USD', 'metric')).toBe(false)
  })

  it('shows a hint on an open entry in listEntries', () => {
    const { open } = listEntries(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] }), 'metric')
    expect(open[0]?.hint).toBe('Includes Tue Dinner, not marked Cooked yet')
  })
})

describe('notNeededEntries', () => {
  it('flattens list.notNeeded like open Lines, with the quantity and without a tick state', () => {
    const list = makeList({ notNeeded: [makeLine({ ingredientId: 5, name: 'Rice', baseUnit: 'g', quantity: 600, pack: null, estimatedCostCents: null })] })
    expect(notNeededEntries(list, 'metric')).toEqual([expect.objectContaining({ key: 'line:5', kind: 'line', ingredientId: 5, title: 'Rice', quantityText: '600 g', ticked: false })])
  })

  it('keeps the hint of a Not needed Line that has unconfirmed past meals', () => {
    const list = makeList({ notNeeded: [makeLine({ pastPlannedMeals: [makePast()] })] })
    expect(notNeededEntries(list, 'metric')[0]?.hint).toBe('Includes Tue Dinner, not marked Cooked yet')
  })

  it('is empty for a list without the field (a snapshot saved by an older version)', () => {
    expect(notNeededEntries(makeList(), 'metric')).toEqual([])
    expect(notNeededEntries(makeList({ notNeeded: [] }), 'metric')).toEqual([])
  })

  it('does not move Not needed Lines into the open or ticked entries', () => {
    const list = makeList({ lines: [], notNeeded: [makeLine()] })
    expect(listEntries(list, 'metric')).toEqual({ open: [], ticked: [] })
  })
})
