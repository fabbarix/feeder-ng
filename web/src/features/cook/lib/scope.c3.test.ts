// CRS C3: a cook scope names its Course. No two-part scope is ever written, not even for the main Course.
import { describe, expect, it } from 'vitest'
import { scopeOf } from './scope'

describe('scopeOf', () => {
  it('a Planned Meal scope has three parts: date, Meal Slot and Course', () => {
    expect(scopeOf({ kind: 'meal', date: '2026-11-10', mealSlotId: 4, courseId: 7 } as never)).toBe('meal:2026-11-10/4/7')
  })

  it('a Planned Meal source without a Course has no scope (it is never the two-part form)', () => {
    let scope: string | undefined
    try {
      scope = scopeOf({ kind: 'meal', date: '2026-11-10', mealSlotId: 4 } as never)
    } catch {
      scope = undefined
    }
    expect(scope).not.toBe('meal:2026-11-10/4')
  })

  it('a Recipe scope is as before', () => {
    expect(scopeOf({ kind: 'recipe', recipeId: 12, batches: 1 })).toBe('recipe:12')
  })
})
