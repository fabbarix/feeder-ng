// B9-28 (RX-01, RX-12): the pure view-model of the Recipes tile, the questions, the result and the Ingredient rows.
import { describe, expect, it } from 'vitest'
import { applied, baseLine, confirmed } from '../fixtures.baseRecipes.test-helper'
import { courseRow, match, plan, preview, prompt, recipe } from '../fixtures.test-helper'
import { takeOver } from '../fixtures.baseRecipes.test-helper'
import {
  addedRows, exactMatches, ingredientRowMeta, ingredientRowState, openCount, openQuestions, orderIngredientRows, recipeRowMeta, recipeRowState,
  resultRowMeta, resultRowState, reviewCounts,
} from './reviewSummary'

const lasagne = (over = {}) => recipe({ index: 1, name: 'Lasagne (ready meal)', preview: preview({ readyMeal: true, yield: 2, courses: ['Main'] }), ...over })
const conflict = (index: number, name: string, over = {}) => recipe({ index, name, status: 'conflict', existingId: 40 + index, resolved: false, ...over })

describe('openQuestions (RX-01)', () => {
  it('is empty when nothing is open', () => {
    expect(openQuestions(plan({ recipes: [recipe()], ingredients: [match({ key: 'onion' })] }))).toEqual([])
  })

  it('lists the unanswered questions in page order: Recipe conflicts, Base recipe lines, Courses, then Ingredients and units', () => {
    const p = plan({
      recipes: [conflict(0, 'Soup'), recipe({ index: 1, name: 'Stew' }), conflict(2, 'Pie')],
      baseRecipeLines: [baseLine({ path: '$.recipes[1].ingredients[0]' })],
      courses: [courseRow({ key: 'brunch', status: 'unknown', resolved: false, effective: undefined })],
      ingredients: [match({ key: 'flour', name: 'flour', status: 'undefined', resolved: false, effective: undefined }), match({ key: 'salt' })],
      unitPrompts: [prompt({ key: 'salt', ingredient: 'salt', unit: 'pinch' })],
    })
    expect(openQuestions(p)).toEqual([
      { kind: 'recipe', id: 'recipe-0' },
      { kind: 'recipe', id: 'recipe-2' },
      { kind: 'baseLine', id: '$.recipes[1].ingredients[0]' },
      { kind: 'course', id: 'course-brunch' },
      { kind: 'ingredient', id: 'ingredient-flour' },
      { kind: 'unit', id: 'ingredient-salt' },
    ])
  })

  it('counts an unanswered take-over ask as a question of its own, after its line (the ids never collide)', () => {
    const p = plan({
      recipes: [recipe()],
      baseRecipeLines: [baseLine({ path: '$.recipes[0].ingredients[1]', resolved: false })],
      takeOvers: [takeOver({ path: '$.recipes[0].ingredients[1]', resolved: false }), takeOver({ path: '$.recipes[1]', resolved: true })],
    })
    expect(openQuestions(p)).toEqual([
      { kind: 'baseLine', id: '$.recipes[0].ingredients[1]' },
      { kind: 'baseLine', id: 'takeover-$.recipes[0].ingredients[1]' },
    ])
  })

  it('drops an answered question at once: an answered conflict, an answered line, a resolved Course, an answered unit', () => {
    const p = plan({
      recipes: [conflict(0, 'Soup', { resolved: true, action: 'skip' })],
      baseRecipeLines: [baseLine({ resolved: true, effective: { action: 'keep' } })],
      courses: [courseRow({ key: 'brunch', resolved: true })],
      unitPrompts: [prompt({ answered: true, toBase: 30 })],
    })
    expect(openQuestions(p)).toEqual([])
  })

  it('counts the same things the bar counts: openCount without the Problems', () => {
    const p = plan({
      recipes: [conflict(0, 'Soup')],
      ingredients: [match({ key: 'flour', status: 'conflict', resolved: false, effective: undefined })],
      unitPrompts: [prompt()],
      problems: [{ path: '$.recipes[0]', code: 'x', message: 'x' }],
    })
    expect(openQuestions(p).length).toBe(openCount(p) - p.problems.length)
  })
})

describe('reviewCounts', () => {
  it('counts the Recipes to import, the skipped ones and every Ingredient row', () => {
    const p = plan({
      recipes: [recipe(), conflict(1, 'Soup', { resolved: true, action: 'skip' }), recipe({ index: 2, name: 'Pie' })],
      ingredients: [match({ key: 'a' }), match({ key: 'b' }), match({ key: 'c', status: 'exact' })],
    })
    expect(reviewCounts(p)).toEqual({ recipes: 2, skipped: 1, ingredients: 3 })
  })
  it('counts an unanswered conflict as to import (it still needs an answer), not as skipped', () => {
    expect(reviewCounts(plan({ recipes: [conflict(0, 'Soup')] }))).toEqual({ recipes: 1, skipped: 0, ingredients: 0 })
  })
})

describe('recipeRowState (RX-01)', () => {
  it('reads New for a new Recipe', () => expect(recipeRowState(recipe())).toEqual({ text: 'New' }))
  it('reads Choose, in the info tone, while a conflict is unanswered', () => {
    expect(recipeRowState(conflict(0, 'Soup'))).toEqual({ text: 'Choose', tone: 'info' })
  })
  it('reads Replaces yours, Kept as <final name> and Skipped once answered', () => {
    expect(recipeRowState(conflict(0, 'Soup', { resolved: true, action: 'replace' }))).toEqual({ text: 'Replaces yours' })
    expect(recipeRowState(conflict(0, 'Lasagne', { resolved: true, action: 'keep_both', importedAs: 'Lasagne (2)' }))).toEqual({ text: 'Kept as Lasagne (2)' })
    expect(recipeRowState(conflict(0, 'Soup', { resolved: true, action: 'skip' }))).toEqual({ text: 'Skipped' })
  })
})

describe('recipeRowMeta (RX-01)', () => {
  it('reads portions, Ingredients, Steps and Course for a plannable Recipe', () => {
    const lines = Array.from({ length: 7 }, (_, i) => ({ quantity: 1, unit: 'g', ingredient: `i${i}`, optional: false }))
    const steps = Array.from({ length: 5 }, (_, i) => ({ text: `s${i}`, kind: 'active' as const, durationMinutes: 5, leadTimeMinutes: 0 }))
    expect(recipeRowMeta(recipe({ preview: preview({ yield: 4, lines, steps, courses: ['Main'] }) }))).toBe('4 portions · 7 Ingredients · 5 Steps · Main')
  })
  it('uses the singular for one portion, one Ingredient and one Step', () => {
    const one = preview({ yield: 1, courses: ['Main'], lines: [{ quantity: 1, unit: 'g', ingredient: 'a', optional: false }], steps: [{ text: 'x', kind: 'active', durationMinutes: 1, leadTimeMinutes: 0 }] })
    expect(recipeRowMeta(recipe({ preview: one }))).toBe('1 portion · 1 Ingredient · 1 Step · Main')
  })
  it('joins several Courses and leaves the Course out when the file names none', () => {
    expect(recipeRowMeta(recipe({ preview: preview({ courses: ['Main', 'Brunch'], lines: [], steps: [] }) }))).toBe('4 portions · 0 Ingredients · 0 Steps · Main, Brunch')
    expect(recipeRowMeta(recipe({ preview: preview({ courses: [], lines: [], steps: [] }) }))).toBe('4 portions · 0 Ingredients · 0 Steps')
  })
  it('reads Ready Meal and its portions for a Ready Meal', () => {
    expect(recipeRowMeta(lasagne())).toBe('Ready Meal · 2 portions')
  })
  it('reads Base recipe and its Batch for a Base recipe', () => {
    expect(recipeRowMeta(recipe({ preview: preview({ baseRecipe: true, yield: 1, yieldUnit: 'l' }) }))).toBe('Base recipe · 1 l')
    expect(recipeRowMeta(recipe({ preview: preview({ baseRecipe: true, yield: 800, yieldUnit: 'g' }) }))).toBe('Base recipe · 800 g')
  })
})

describe('resultRowState and resultRowMeta (RX-01)', () => {
  it('reads Created and Replaced', () => {
    expect(resultRowState(applied({ action: 'created' }), recipe())).toBe('Created')
    expect(resultRowState(applied({ action: 'replaced' }), conflict(0, 'Soup', { resolved: true, action: 'replace' }))).toBe('Replaced')
  })
  it('reads Kept as <final name> for a kept-both Recipe, and Now a Base recipe for a converted one', () => {
    expect(resultRowState(applied({ name: 'Lasagne (2)' }), conflict(0, 'Lasagne', { resolved: true, action: 'keep_both', importedAs: 'Lasagne (2)' }))).toBe('Kept as Lasagne (2)')
    expect(resultRowState(applied({ action: 'converted' }))).toBe('Now a Base recipe')
  })
  it('reads Created without the plan row (an older answer)', () => {
    expect(resultRowState(applied())).toBe('Created')
  })
  it('reads Course, portions and Steps in the result, and Ready Meal with its portions', () => {
    const steps = Array.from({ length: 5 }, (_, i) => ({ text: `s${i}`, kind: 'active' as const, durationMinutes: 5, leadTimeMinutes: 0 }))
    expect(resultRowMeta(recipe({ preview: preview({ yield: 4, courses: ['Main'], steps }) }))).toBe('Main · 4 portions · 5 Steps')
    expect(resultRowMeta(lasagne())).toBe('Ready Meal · 2 portions')
    expect(resultRowMeta(recipe({ preview: preview({ baseRecipe: true, yield: 1, yieldUnit: 'l' }) }))).toBe('Base recipe · 1 l')
  })
})

describe('addedRows (RX-01 "Also added")', () => {
  const thePlan = plan({
    ingredients: [
      match({ key: 'chicken thighs', name: 'chicken thighs', status: 'new' }),
      match({ key: 'basmati rice', name: 'basmati rice', status: 'new' }),
      match({ key: 'greek yogurt', name: 'greek yogurt', status: 'new' }),
      match({ key: 'onion', name: 'onion', status: 'exact', effective: { key: 'onion', action: 'use', ingredientId: 3 } }),
    ],
    unitPrompts: [prompt({ key: 'garam masala', ingredient: 'garam masala', unit: 'tbsp', base: 'g', answered: true, toBase: 6 })],
  })
  it('names the Ingredients created, in display form, with their count', () => {
    const rows = addedRows(confirmed([applied()], { ingredientsCreated: 3 }), thePlan)
    expect(rows[0]).toEqual({ key: 'ingredients', label: 'Ingredients created', state: '3', detail: 'Chicken thighs, Basmati rice, Greek yogurt' })
  })
  it('names an answered unit as "<Ingredient>: 1 <unit> = <n> <base>"', () => {
    const rows = addedRows(confirmed([applied()], { conversionsAdded: 1 }), thePlan)
    expect(rows).toContainEqual({ key: 'conversions', label: 'Unit Conversions added', state: '1', detail: 'Garam masala: 1 tbsp = 6 g' })
  })
  it('adds Course rows when Courses were added or brought back, and no row for a zero', () => {
    const withCourses = plan({
      courses: [
        courseRow({ key: 'brunch', name: 'Brunch', status: 'unknown', effective: { key: 'brunch', action: 'add' } }),
        courseRow({ key: 'tea', name: 'Tea', status: 'archived', effective: { key: 'tea', action: 'unarchive' } }),
      ],
    })
    const rows = addedRows(confirmed([applied()], { coursesCreated: 1, coursesUnarchived: 1 }), withCourses)
    expect(rows).toEqual([
      { key: 'courses', label: 'Courses added', state: '1', detail: 'Brunch' },
      { key: 'coursesBack', label: 'Courses brought back', state: '1', detail: 'Tea' },
    ])
    expect(addedRows(confirmed([applied()]), plan())).toEqual([])
  })
  it('keeps a count with no detail when the plan cannot name them', () => {
    expect(addedRows(confirmed([applied()], { ingredientsCreated: 2 }), plan())).toEqual([{ key: 'ingredients', label: 'Ingredients created', state: '2' }])
  })
})

describe('ingredientRowState and ingredientRowMeta (RX-12)', () => {
  const suggested = match({
    key: 'chicken thighs', name: 'chicken thighs', status: 'suggested', suggestions: [{ id: 5, name: 'Chicken', baseUnit: 'g', score: 0.8 }], effective: { key: 'chicken thighs', action: 'create' },
  })
  it('suggested: Create new, similar to the first suggestion; Uses <name> once a suggestion is chosen', () => {
    expect(ingredientRowState(suggested)).toEqual({ text: 'Create new' })
    expect(ingredientRowMeta(suggested)).toBe('Similar to Chicken')
    const chosen = { ...suggested, effective: { key: 'chicken thighs', action: 'use' as const, ingredientId: 5 } }
    expect(ingredientRowState(chosen)).toEqual({ text: 'Uses Chicken' })
  })
  it('new: New, with its Base unit', () => {
    const m = match({ key: 'saffron', status: 'new', definition: { name: 'saffron', baseUnit: 'g' } })
    expect(ingredientRowState(m)).toEqual({ text: 'New' })
    expect(ingredientRowMeta(m)).toBe('Base unit g')
  })
  it('undefined: 1 question in the info tone, asking for its base unit', () => {
    const m = match({ key: 'x', status: 'undefined', resolved: false, effective: undefined })
    expect(ingredientRowState(m)).toEqual({ text: '1 question', tone: 'info' })
    expect(ingredientRowMeta(m)).toBe('Choose its base unit')
  })
  it('conflict: 1 question in the info tone, saying both base units', () => {
    const m = match({ key: 'x', status: 'conflict', resolved: false, effective: undefined, match: { id: 3, name: 'x', baseUnit: 'ml' }, conflict: { file: 'g', existing: 'ml' } })
    expect(ingredientRowState(m)).toEqual({ text: '1 question', tone: 'info' })
    expect(ingredientRowMeta(m)).toBe('In g here, in ml in your Ingredients')
  })
  it('an open unit question wins: 1 question, "How many g is 1 tbsp?"', () => {
    const m = match({ key: 'garam masala', status: 'new' })
    const q = prompt({ key: 'garam masala', unit: 'tbsp', base: 'g' })
    expect(ingredientRowState(m, q)).toEqual({ text: '1 question', tone: 'info' })
    expect(ingredientRowMeta(m, q)).toBe('How many g is 1 tbsp?')
  })
  it('an Ingredient that adds a Picture says so, on the Ingredient it gives it to', () => {
    const m = match({ key: 'garlic', name: 'garlic', status: 'exact', addsImage: true, match: { id: 4, name: 'Garlic', baseUnit: 'piece' } })
    expect(ingredientRowMeta(m)).toBe('Adds a Picture to Garlic')
  })
})

describe('orderIngredientRows and exactMatches (RX-12)', () => {
  const p = plan({
    ingredients: [
      match({ key: 'zucchini', name: 'zucchini', status: 'new' }),
      match({ key: 'onion', name: 'onion', status: 'exact', effective: { key: 'onion', action: 'use', ingredientId: 1 } }),
      match({ key: 'flour', name: 'flour', status: 'undefined', resolved: false, effective: undefined }),
      match({ key: 'apple', name: 'apple', status: 'new' }),
      match({ key: 'salt', name: 'salt', status: 'exact', effective: { key: 'salt', action: 'use', ingredientId: 2 } }),
      match({ key: 'butter', name: 'butter', status: 'new' }),
    ],
    unitPrompts: [prompt({ key: 'butter', ingredient: 'butter', unit: 'knob' })],
  })
  it('puts the questions first (an unresolved row, or a row with an open unit question), then the rest by name', () => {
    expect(orderIngredientRows(p).map((m) => m.key)).toEqual(['butter', 'flour', 'apple', 'zucchini'])
  })
  it('leaves the exact matches out of the rows: they close the list in one row', () => {
    expect(exactMatches(p).map((m) => m.key)).toEqual(['onion', 'salt'])
  })
  it('keeps an exact match that has an open unit question among the rows', () => {
    const q = plan({ ingredients: [match({ key: 'salt', status: 'exact' })], unitPrompts: [prompt({ key: 'salt', ingredient: 'salt', unit: 'pinch' })] })
    expect(orderIngredientRows(q).map((m) => m.key)).toEqual(['salt'])
    expect(exactMatches(q)).toEqual([])
  })
})
