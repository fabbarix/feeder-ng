// B9-37 (RX-10, decision RX 4): the Recipe's kind is one choice, Recipe | Ready Meal | Base recipe. Ready Meal and Base recipe exclude each
// other. kindOf reads a draft; setKind applies a choice on top of setBaseRecipe (a Base recipe clears Ready Meal and the plannable fields).
// The Ready Meal pack line itself is kept in step by useRecipeEditor's syncReadyMealLine, which the screen tests cover.
import { describe, expect, it } from 'vitest'
import { kindOf, setKind } from './baseRecipe'
import { emptyDraft, type RecipeDraft } from './draft'

const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({ ...emptyDraft(), name: 'Lasagne', courseIds: [1, 2], wholeMeal: true, cooldownDays: '5', ...over })

describe('kindOf', () => {
  it('is recipe for an ordinary draft, readyMeal when the Ready Meal box is on, base for a Base recipe', () => {
    expect(kindOf(draft())).toBe('recipe')
    expect(kindOf(draft({ readyMeal: true }))).toBe('readyMeal')
    expect(kindOf(draft({ baseRecipe: true, yieldUnit: 'g' }))).toBe('base')
  })

  it('base wins if a draft ever carries both flags', () => {
    expect(kindOf(draft({ baseRecipe: true, readyMeal: true }))).toBe('base')
  })
})

describe('setKind', () => {
  it('returns the same draft when the kind does not change', () => {
    const d = draft()
    expect(setKind(d, 'recipe')).toBe(d)
    const r = draft({ readyMeal: true })
    expect(setKind(r, 'readyMeal')).toBe(r)
  })

  it('recipe to readyMeal turns Ready Meal on and leaves the rest', () => {
    const out = setKind(draft(), 'readyMeal')
    expect(out).toMatchObject({ readyMeal: true, courseIds: [1, 2], cooldownDays: '5' })
    expect(kindOf(out)).toBe('readyMeal')
    expect(out.baseRecipe ?? false).toBe(false)
  })

  it('readyMeal to recipe turns it off', () => {
    const out = setKind(draft({ readyMeal: true }), 'recipe')
    expect(out.readyMeal).toBe(false)
    expect(kindOf(out)).toBe('recipe')
  })

  it('recipe to base clears Ready Meal, the Courses, Whole meal and the plannable overrides, and gives a Yield unit (as setBaseRecipe does)', () => {
    const out = setKind(draft({ cooldownDays: '5', leftoverUseByDays: '3', frozenUseByDays: '60', reheatMinutes: '4' }), 'base')
    expect(kindOf(out)).toBe('base')
    expect(out).toMatchObject({ readyMeal: false, courseIds: [], wholeMeal: false, cooldownDays: '', leftoverUseByDays: '', frozenUseByDays: '', reheatMinutes: '' })
    expect(out.yieldUnit).toBe('portion')
  })

  it('readyMeal to base turns Ready Meal off at the same time (they exclude each other)', () => {
    const out = setKind(draft({ readyMeal: true }), 'base')
    expect(out).toMatchObject({ baseRecipe: true, readyMeal: false })
  })

  it('base to recipe turns the Base recipe off and clears its Yield unit', () => {
    const out = setKind(draft({ baseRecipe: true, yieldUnit: 'g', courseIds: [] }), 'recipe')
    expect(out.baseRecipe).toBe(false)
    expect(out.yieldUnit).toBe('')
    expect(out.readyMeal).toBe(false)
  })

  it('base to readyMeal turns the Base recipe off and Ready Meal on', () => {
    const out = setKind(draft({ baseRecipe: true, yieldUnit: 'g', courseIds: [] }), 'readyMeal')
    expect(out).toMatchObject({ baseRecipe: false, readyMeal: true, yieldUnit: '' })
  })

  it('does not mutate its input', () => {
    const d = draft()
    const copy = JSON.parse(JSON.stringify(d))
    setKind(d, 'base')
    expect(d).toEqual(copy)
  })
})
