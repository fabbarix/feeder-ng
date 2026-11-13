// DS-SHOP (docs/design/system.md §3): the pure rules behind a Shop row. A row is a ListRow: the title, ONE meta line, the
// value column; a sentence that applies to many rows is said once in a notice, so the row only carries a short info marker.
import { describe, expect, it } from 'vitest'
import { makeExtra, makeLine, makePast } from '../testData'
import { extraEntry, lineEntry } from './lines'
import { lineActions, rowMeta, rowValue, slotsLabel } from './rows'

const plain = lineEntry(makeLine(), 'USD', 'metric')
const hinted = lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')

describe('slotsLabel', () => {
  it('names the slots, oldest first, joined with "and" (the notice uses it too)', () => {
    expect(slotsLabel([makePast()])).toBe('Tue Dinner')
    expect(slotsLabel([makePast(), makePast({ date: '2026-11-04', mealSlotId: 1, mealSlotName: 'Lunch' })])).toBe('Tue Dinner and Wed Lunch')
  })
  it('lists the Courses of one slot when there are several', () => {
    expect(slotsLabel([makePast({ courseName: 'Main' }), makePast({ courseName: 'Side' })])).toBe('Tue Dinner (Main, Side)')
  })
  it('is empty without meals', () => {
    expect(slotsLabel(undefined)).toBe('')
    expect(slotsLabel([])).toBe('')
  })
})

describe('lineEntry: the short hint', () => {
  it('carries the full sentence (the Line sheet) and a short marker without the "not marked Cooked yet" part', () => {
    expect(hinted.hint).toBe('Includes Tue Dinner, not marked Cooked yet')
    expect(hinted.hintShort).toBe('Includes Tue Dinner')
  })
  it('the short marker never lists Courses: it has to fit one line', () => {
    const e = lineEntry(makeLine({ pastPlannedMeals: [makePast({ courseName: 'Main' }), makePast({ courseName: 'Side' })] }), 'USD', 'metric')
    expect(e.hintShort).toBe('Includes Tue Dinner')
  })
  it('several slots: "Includes Tue Dinner and Wed Lunch"', () => {
    const e = lineEntry(makeLine({ pastPlannedMeals: [makePast(), makePast({ date: '2026-11-04', mealSlotId: 1, mealSlotName: 'Lunch' })] }), 'USD', 'metric')
    expect(e.hintShort).toBe('Includes Tue Dinner and Wed Lunch')
  })
  it('has no key without unconfirmed past meals', () => {
    expect('hintShort' in plain).toBe(false)
    expect('hintShort' in extraEntry(makeExtra(), 'metric')).toBe(false)
  })
})

describe('rowMeta: one line, tone-able', () => {
  it('a Line with a pack suggestion shows the pack, untoned', () => {
    expect(rowMeta(plain)).toEqual({ text: '2 × Mutti 700 g' })
  })
  it('a Line with unconfirmed past meals shows the short info marker instead (info tone)', () => {
    expect(rowMeta(hinted)).toEqual({ text: 'Includes Tue Dinner', status: 'info' })
  })
  it('a Line with neither, an extra and a ticked Line show no meta', () => {
    expect(rowMeta(lineEntry(makeLine({ pack: null }), 'USD', 'metric')).text).toBe('')
    expect(rowMeta(extraEntry(makeExtra(), 'metric')).text).toBe('')
    expect(rowMeta(lineEntry(makeLine({ ticked: true, quantity: 0 }), 'USD', 'metric')).text).toBe('')
  })
})

describe('rowValue: the quantity column', () => {
  it('the quantity is the value and the estimated cost the sub-value', () => {
    expect(rowValue(plain)).toEqual({ value: '1400 g', subValue: '$3.18' })
  })
  it('no Price: no sub-value, never a dash', () => {
    const e = lineEntry(makeLine({ estimatedCostCents: null }), 'USD', 'metric')
    expect(rowValue(e)).toEqual({ value: '1400 g' })
  })
  it('a free-text extra and a ticked Line have no value at all', () => {
    expect(rowValue(extraEntry(makeExtra(), 'metric'))).toEqual({})
    expect(rowValue(lineEntry(makeLine({ ticked: true, quantity: 0, estimatedCostCents: 318 }), 'USD', 'metric'))).toEqual({})
  })
})

describe('lineActions: what the row sheet offers', () => {
  it('an open Line: Not needed', () => {
    expect(lineActions(plain, 'open')).toEqual(['not-needed'])
  })
  it('an open Line with unconfirmed past meals: Mark it first, then Not needed', () => {
    expect(lineActions(hinted, 'open')).toEqual(['mark-it', 'not-needed'])
  })
  it('an open extra: Delete (extras can be deleted, Lines cannot)', () => {
    expect(lineActions(extraEntry(makeExtra(), 'metric'), 'open')).toEqual(['delete'])
  })
  it('a ticked Line: nothing to do but Mark it, when it has a hint; the tick control unticks it', () => {
    const ticked = lineEntry(makeLine({ ticked: true, quantity: 0 }), 'USD', 'metric')
    expect(lineActions(ticked, 'ticked')).toEqual([])
    const tickedHinted = lineEntry(makeLine({ ticked: true, quantity: 0, pastPlannedMeals: [makePast()] }), 'USD', 'metric')
    expect(lineActions(tickedHinted, 'ticked')).toEqual(['mark-it'])
  })
  it('a ticked extra can still be deleted', () => {
    expect(lineActions(extraEntry(makeExtra({ ticked: true }), 'metric'), 'ticked')).toEqual(['delete'])
  })
  it('a Not needed Line: Needed after all (and Mark it with a hint)', () => {
    expect(lineActions(plain, 'not-needed')).toEqual(['needed-after-all'])
    expect(lineActions(hinted, 'not-needed')).toEqual(['mark-it', 'needed-after-all'])
  })
})
