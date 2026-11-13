import { describe, expect, it } from 'vitest'
import { recipe } from '../fixtures.test-helper'
import { draftFromRecipe, draftToInput, emptyDraft, validateDraft, type RecipeDraft } from './draft'
import { validateCourses } from './recipeCourses'
import type { BaseRecipeLineInput } from '../types'

const baseRecipeOut = recipe({
  id: 2, name: 'Béchamel', yield: 1, yieldUnit: 'l', baseRecipe: true, baseIngredientId: 30, courses: [], wholeMeal: false, usedBy: [], within: [],
  lines: [
    { id: 11, ingredientId: 9, ingredient: 'milk', quantity: 1000, unit: 'ml', optional: false, note: '' },
    { id: 12, ingredientId: 31, ingredient: 'Roux', quantity: 100, unit: 'g', optional: false, note: '', baseRecipe: { id: 4, name: 'Roux', archived: false }, neededAtStep: 1, neededAt: 1, linkedFromIngredientId: 6 },
  ],
})

describe('draftFromRecipe for a Base recipe', () => {
  it('carries the kind, the Yield unit, line ids, the Base recipe of a line, its Needed at and where it was linked from', () => {
    const d = draftFromRecipe(baseRecipeOut)
    expect(d).toMatchObject({ baseRecipe: true, yieldUnit: 'l', yield: '1', courseIds: [] })
    expect(d.lines[0]).toMatchObject({ id: 11, ingredientId: 9 })
    expect(d.lines[0]?.baseRecipeId ?? null).toBeNull()
    expect(d.lines[1]).toMatchObject({ id: 12, ingredientId: 31, baseRecipeId: 4, baseRecipeName: 'Roux', neededAtStep: 1, linkedFromIngredientId: 6 })
  })
  it('a plannable Recipe stays a plannable draft with no Yield unit', () => {
    expect(draftFromRecipe(recipe())).toMatchObject({ baseRecipe: false, yieldUnit: '' })
  })
})

describe('draftToInput for a Base recipe (the body of POST/PUT /api/recipes)', () => {
  it('sends baseRecipe, yield and yieldUnit, no Courses, and a Base recipe line by baseRecipeId (with its id and remembered Ingredient) and no ingredientId', () => {
    const body = draftToInput(draftFromRecipe(baseRecipeOut))
    expect(body).toMatchObject({ name: 'Béchamel', yield: 1, yieldUnit: 'l', baseRecipe: true, courseIds: [], wholeMeal: false, readyMeal: false })
    const [plain, based] = body.lines
    expect(plain).toMatchObject({ ingredientId: 9, quantity: 1000, unit: 'ml' })
    expect(based).toEqual<BaseRecipeLineInput>({ id: 12, baseRecipeId: 4, quantity: 100, unit: 'g', optional: false, note: '', neededAtStep: 1, linkedFromIngredientId: 6 })
    expect('ingredientId' in (based as object)).toBe(false)
  })
  it('sends neededAtStep null when the default applies', () => {
    const d = draftFromRecipe(baseRecipeOut)
    const line = d.lines[1]!
    const body = draftToInput({ ...d, lines: [{ ...line, neededAtStep: null }] })
    expect(body.lines[0]).toMatchObject({ baseRecipeId: 4, neededAtStep: null })
  })
  it('a plannable Recipe sends no baseRecipe and no yieldUnit (a PUT cannot change the kind; absent keeps it)', () => {
    const body = draftToInput(draftFromRecipe(recipe()))
    expect('baseRecipe' in body && body.baseRecipe).toBeFalsy()
    expect(body.yieldUnit ?? '').toBe('')
  })
  it('sends takeOver only when the User answered the ask', () => {
    const d = draftFromRecipe(baseRecipeOut)
    expect(draftToInput(d).takeOver).toBeUndefined()
    expect(draftToInput({ ...d, takeOver: false }).takeOver).toBe(false)
    expect(draftToInput({ ...d, takeOver: true }).takeOver).toBe(true)
  })
})

describe('validation for a Base recipe', () => {
  const base = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({ ...emptyDraft(), name: 'Béchamel', baseRecipe: true, yieldUnit: 'l', ...over })
  it('needs a Yield unit', () => {
    expect(validateDraft(base({ yieldUnit: '' }))).toHaveProperty('yieldUnit', 'yield_unit_invalid')
    expect(validateDraft(base())).not.toHaveProperty('yieldUnit')
  })
  it('does not need a Course (and a plannable draft still does)', () => {
    expect(validateCourses(base({ courseIds: [] }))).toEqual({})
    expect(Object.keys(validateCourses({ ...emptyDraft(), courseIds: [] })).length).toBeGreaterThan(0)
  })
  it('does not need an ingredient line', () => {
    expect(validateDraft(base({ lines: [] }))).toEqual({})
  })
})
