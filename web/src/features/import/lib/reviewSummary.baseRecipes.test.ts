// BR-E: the Base recipe tiles in the review summary. RED until lib/reviewSummary.ts counts them.
import { describe, expect, it } from 'vitest'
import { baseLine, takeOver } from '../fixtures.baseRecipes.test-helper'
import { match, plan, prompt, recipe } from '../fixtures.test-helper'
import { canConfirm, openCount, reviewSteps } from './reviewSummary'

describe('reviewSteps with Base recipe lines', () => {
  it('has no Base recipe step without a tile', () => {
    expect(reviewSteps(plan()).map((s) => s.id)).not.toContain('baseRecipes')
  })

  it('puts the step after the Ingredients and before the units, Courses and Recipe conflicts', () => {
    const p = plan({
      ingredients: [match({ key: 'a' })],
      unitPrompts: [prompt()],
      recipes: [recipe({ status: 'conflict', resolved: false })],
      baseRecipeLines: [baseLine()],
    })
    expect(reviewSteps(p).map((s) => s.id)).toEqual(['ingredients', 'baseRecipes', 'units', 'recipes'])
  })

  it('counts a tile with no answer as open, and an answered one as done', () => {
    const p = plan({ baseRecipeLines: [baseLine({ path: 'a', resolved: true, effective: { action: 'keep' } }), baseLine({ path: 'b' })] })
    expect(reviewSteps(p).find((s) => s.id === 'baseRecipes')).toEqual({ id: 'baseRecipes', total: 2, open: 1 })
  })

  it('counts an unanswered take-over ask as open in the same step', () => {
    const p = plan({ baseRecipeLines: [baseLine({ resolved: true, effective: { action: 'create' } })], takeOvers: [takeOver({ resolved: false })] })
    expect(reviewSteps(p).find((s) => s.id === 'baseRecipes')!.open).toBe(1)
    expect(openCount(p)).toBe(1)
  })

  it('does not let Confirm through while a tile is open, even if the plan says ready', () => {
    const p = plan({ ready: true, baseRecipeLines: [baseLine()] })
    expect(canConfirm(p, false)).toBe(false)
  })

  it('lets Confirm through when every tile is answered and the plan is ready', () => {
    const p = plan({ ready: true, baseRecipeLines: [baseLine({ resolved: true, effective: { action: 'keep' } })] })
    expect(canConfirm(p, false)).toBe(true)
  })
})
