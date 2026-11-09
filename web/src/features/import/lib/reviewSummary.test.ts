import { describe, expect, it } from 'vitest'
import { match, plan, prompt, recipe } from '../fixtures.test-helper'
import { canConfirm, ingredientOptions, openCount, reviewSteps } from './reviewSummary'

describe('reviewSteps', () => {
  it('always shows the Ingredients and nothing else for a plain plan', () => {
    const p = plan({ ingredients: [match({ key: 'a' }), match({ key: 'b', status: 'exact' })] })
    expect(reviewSteps(p)).toEqual([{ id: 'ingredients', total: 2, open: 0 }])
    expect(openCount(p)).toBe(0)
  })
  it('counts unresolved Ingredients, unanswered units, unresolved conflicts and problems as open, in tile order', () => {
    const p = plan({
      ready: false,
      problems: [{ path: '$.recipes[0].yield', code: 'yield_invalid', message: 'bad' }],
      ingredients: [match({ key: 'onion', status: 'conflict', resolved: false }), match({ key: 'lemon' })],
      unitPrompts: [prompt(), prompt({ unit: 'bunch', answered: true, toBase: 80 })],
      recipes: [recipe({ status: 'conflict', resolved: false }), recipe({ index: 1, name: 'Lasagne' })],
      warnings: [{ path: '$.recipes[0].image', code: 'image_failed', message: 'x' }],
    })
    expect(reviewSteps(p)).toEqual([
      { id: 'problems', total: 1, open: 1 },
      { id: 'ingredients', total: 2, open: 1 },
      { id: 'units', total: 2, open: 1 },
      { id: 'recipes', total: 1, open: 1 },
      { id: 'images', total: 1, open: 0 },
    ])
    expect(openCount(p)).toBe(4)
  })
  it('lists only conflicting Recipes in the recipes tile, and hides it when none conflict', () => {
    expect(reviewSteps(plan({ recipes: [recipe(), recipe({ index: 1 })] })).map((s) => s.id)).toEqual(['ingredients'])
    const answered = plan({ recipes: [recipe({ status: 'conflict', resolved: true, action: 'skip' })] })
    expect(reviewSteps(answered).find((s) => s.id === 'recipes')).toEqual({ id: 'recipes', total: 1, open: 0 })
  })
})

describe('canConfirm', () => {
  it('needs a ready plan and no request in flight', () => {
    expect(canConfirm(plan({ ready: true }), false)).toBe(true)
    expect(canConfirm(plan({ ready: true }), true)).toBe(false)
    expect(canConfirm(plan({ ready: false }), false)).toBe(false)
  })
})

describe('ingredientOptions', () => {
  it('puts the existing match first, then suggestions by score, then create', () => {
    const m = match({
      key: 'chicken thighs',
      status: 'suggested',
      suggestions: [
        { id: 3, name: 'chicken thigh', baseUnit: 'g', score: 0.9 },
        { id: 4, name: 'thighs', baseUnit: 'g', score: 0.7 },
      ],
    })
    expect(ingredientOptions(m).map((o) => [o.kind, o.id])).toEqual([['suggestion', 3], ['suggestion', 4], ['create', undefined]])
    const exact = match({ key: 'onion', status: 'exact', match: { id: 7, name: 'Onion', baseUnit: 'piece' } })
    expect(ingredientOptions(exact).map((o) => [o.kind, o.id])).toEqual([['existing', 7], ['create', undefined]])
  })
})
