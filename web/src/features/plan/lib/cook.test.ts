import { describe, expect, it } from 'vitest'
import type { CookedResult, Leftover, StockWarning } from '../types'
import { adjustLeftover, cookPath, cookedSuccessText, correctionFor, formatPortions, leftoverOutcome, leftoverOutcomeText, parseTotal } from './cook'

describe('adjustLeftover', () => {
  it('moves by half a portion and clamps to 0..max', () => {
    expect(adjustLeftover(2, 1, 4)).toBe(2.5)
    expect(adjustLeftover(2, -1, 4)).toBe(1.5)
    expect(adjustLeftover(4, 1, 4)).toBe(4)
    expect(adjustLeftover(0.5, -1, 4)).toBe(0)
    expect(adjustLeftover(0, -1, 4)).toBe(0)
  })

  it('accepts another step', () => {
    expect(adjustLeftover(2, 1, 4, 1)).toBe(3)
  })
})

describe('formatPortions', () => {
  it('uses the singular only for exactly one', () => {
    expect(formatPortions(1)).toBe('1 portion')
    expect(formatPortions(1.5)).toBe('1.5 portions')
    expect(formatPortions(2)).toBe('2 portions')
    expect(formatPortions(0)).toBe('0 portions')
  })
})

describe('correctionFor', () => {
  it('prefills the post-cook total, which is 0 after the floored deduction', () => {
    const w: StockWarning = { ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 800, shortfall: 500, message: 'Stock shows only 300 g chicken thighs, the recipe uses 800 g' }
    expect(correctionFor(w)).toEqual({ ingredientId: 11, ingredient: 'chicken thighs', total: 0 })
  })
})

describe('parseTotal', () => {
  it('reads a non-negative number, with a dot or a comma', () => {
    expect(parseTotal('250')).toBe(250)
    expect(parseTotal(' 12,5 ')).toBe(12.5)
    expect(parseTotal('0')).toBe(0)
  })

  it('refuses anything else', () => {
    for (const bad of ['', 'abc', '-1', '1e', '12 g']) expect(parseTotal(bad)).toBeNull()
  })
})

describe('leftoverOutcome (B13)', () => {
  const leftover = (portions: number): Leftover => ({
    id: 3, recipeId: 7, recipeName: 'Chicken', portions, cookedOn: '2026-11-09', useBy: '2026-11-12', fromDate: '2026-11-09', fromMealSlotId: 2,
  })
  const result = (over: Partial<CookedResult>): CookedResult => ({
    meal: {} as CookedResult['meal'], leftover: null, warnings: [], plannedFor: [], ...over,
  })
  const tue = { date: '2026-11-10', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Chicken' }
  const wed = { date: '2026-11-11', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Chicken' }

  it('none: no Leftover was recorded', () => {
    expect(leftoverOutcome(result({}))).toEqual({ kind: 'none' })
    expect(leftoverOutcomeText({ kind: 'none' })).toBe('No Leftovers')
  })

  it('planned: the later meals served from it', () => {
    const o = leftoverOutcome(result({ leftover: leftover(2), plannedFor: [tue] }))
    expect(o).toEqual({
      kind: 'planned', portions: 2, useBy: '2026-11-12', meals: [{ date: '2026-11-10', mealSlotName: 'Dinner', recipeName: 'Chicken' }],
    })
    expect(leftoverOutcomeText(o)).toBe('2 portions planned for Tue Dinner')
  })

  it('planned for several meals', () => {
    const o = leftoverOutcome(result({ leftover: leftover(4), plannedFor: [tue, wed] }))
    expect(leftoverOutcomeText(o)).toBe('4 portions planned for Tue Dinner and Wed Dinner')
  })

  it('kept: recorded but planned for nothing, with its Use-by', () => {
    const o = leftoverOutcome(result({ leftover: leftover(1) }))
    expect(o).toEqual({ kind: 'kept', portions: 1, useBy: '2026-11-12' })
    expect(leftoverOutcomeText(o)).toBe('1 portion kept, good until Thu')
  })
})

describe('cookPath (B2: Cook Mode from a Planned Meal)', () => {
  it('is /cook/meal/<date>/<mealSlotId>', () => {
    expect(cookPath({ date: '2026-11-10', mealSlotId: 3 })).toBe('/cook/meal/2026-11-10/3')
  })
})

describe('cookedSuccessText (the one-tap Yes, Cooked toast)', () => {
  const tue = { date: '2026-11-10', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Chicken' }
  const wed = { date: '2026-11-11', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Chicken' }
  const base: CookedResult = {
    meal: { date: '2026-11-09', mealSlotId: 2, recipeId: 7, recipeName: 'Chicken', batches: 1, portions: 2, state: 'cooked', pinned: true, servedFromLeftover: null, why: [] },
    leftover: null, warnings: [], plannedFor: [],
  }
  const withLeftover = (portions: number): Leftover => ({
    id: 1, recipeId: 7, recipeName: 'Chicken', portions, cookedOn: '2026-11-09', useBy: '2026-11-12', fromDate: '2026-11-09', fromMealSlotId: 2,
  })

  it('no Leftover: just the cheer', () => {
    expect(cookedSuccessText(base)).toBe('Cooked, nice one!')
  })

  it('planned: says where the Leftover went', () => {
    expect(cookedSuccessText({ ...base, leftover: withLeftover(2), plannedFor: [tue] })).toBe('Cooked, nice one! 2 portions → Tue Dinner')
    expect(cookedSuccessText({ ...base, leftover: withLeftover(4), plannedFor: [tue, wed] })).toBe('Cooked, nice one! 4 portions → Tue Dinner and Wed Dinner')
  })

  it('kept: says it is kept and until when', () => {
    expect(cookedSuccessText({ ...base, leftover: withLeftover(1) })).toBe('Cooked, nice one! 1 portion kept, good until Thu')
  })
})
