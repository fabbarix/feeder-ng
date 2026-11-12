import { describe, expect, it } from 'vitest'
import { cookMealPath, cookRecipePath, exitPathFor } from './scope'

describe('cookRecipePath (the Cook/Batch entry on Recipe detail links here)', () => {
  it('opens a Recipe with its Batch count', () => {
    expect(cookRecipePath(12, 2)).toBe('/cook/recipe/12?batches=2')
    expect(cookRecipePath(12, 1.5)).toBe('/cook/recipe/12?batches=1.5')
  })
  it('leaves one Batch out of the query', () => {
    expect(cookRecipePath(12)).toBe('/cook/recipe/12')
    expect(cookRecipePath(12, 1)).toBe('/cook/recipe/12')
  })
  it('counts anything that is not a number above zero as one Batch', () => {
    expect(cookRecipePath(12, 0)).toBe('/cook/recipe/12')
    expect(cookRecipePath(12, -3)).toBe('/cook/recipe/12')
    expect(cookRecipePath(12, Number.NaN)).toBe('/cook/recipe/12')
  })
})

describe('cookMealPath', () => {
  it('opens a Planned Meal by date and Meal Slot', () => {
    expect(cookMealPath('2026-11-09', 2)).toBe('/cook/meal/2026-11-09/2')
  })
})

describe('exitPathFor', () => {
  it('leaves a Recipe session for the Recipe and a Planned Meal session for Today', () => {
    expect(exitPathFor({ kind: 'recipe', recipeId: 7, batches: 2 })).toBe('/recipes/7')
    expect(exitPathFor({ kind: 'meal', date: '2026-11-09', mealSlotId: 2, courseId: 1 })).toBe('/')
  })
})
