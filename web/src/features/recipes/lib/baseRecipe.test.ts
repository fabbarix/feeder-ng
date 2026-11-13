import { describe, expect, it } from 'vitest'
import { summary } from '../fixtures.test-helper'
import {
  baseLineLabel, baseTileMeta, fieldsFor, kindFromParams, linkDraftLine, neededAtLabel, neededAtOptions, setBaseRecipe, unlinkDraftLine, usedInText, withKind, yieldText,
} from './baseRecipe'
import { emptyDraft, type LineDraft } from './draft'

const line = (over: Partial<LineDraft> = {}): LineDraft => ({ key: 'l1', ingredientId: 5, ingredientName: 'béchamel', quantity: '500', unit: 'ml', optional: true, note: 'warm', ...over })

describe('fieldsFor: which details fields a kind shows', () => {
  it('a plannable Recipe shows everything but the Yield unit', () => {
    expect(fieldsFor(false)).toEqual({ courses: true, wholeMeal: true, readyMeal: true, cooldown: true, leftoverUseBy: true, reheat: true, frozenUseBy: true, yieldUnit: false })
  })
  it('a Base recipe hides Courses, Whole meal, Ready Meal, Cool-down, Use-by, Reheat time and Frozen Use-by, and shows the Yield unit', () => {
    expect(fieldsFor(true)).toEqual({ courses: false, wholeMeal: false, readyMeal: false, cooldown: false, leftoverUseBy: false, reheat: false, frozenUseBy: false, yieldUnit: true })
  })
})

describe('setBaseRecipe: the editor switch', () => {
  const plannable = { ...emptyDraft(), name: 'Béchamel', courseIds: [1, 2], wholeMeal: true, wholeMealSet: true, readyMeal: true, cooldownDays: '3', leftoverUseByDays: '2', frozenUseByDays: '60', reheatMinutes: '5' }
  it('on: marks the draft, defaults the Yield unit to portion and clears what does not apply', () => {
    const d = setBaseRecipe(plannable, true)
    expect(d).toMatchObject({ baseRecipe: true, yieldUnit: 'portion', courseIds: [], wholeMeal: false, wholeMealSet: false, readyMeal: false, cooldownDays: '', leftoverUseByDays: '', frozenUseByDays: '', reheatMinutes: '' })
    expect(plannable.courseIds).toEqual([1, 2]) // not mutated
  })
  it('on keeps a Yield unit already chosen, and the name, Yield, lines and Steps', () => {
    const d = setBaseRecipe({ ...plannable, yieldUnit: 'l', yield: '2' }, true)
    expect(d).toMatchObject({ yieldUnit: 'l', yield: '2', name: 'Béchamel' })
  })
  it('off: back to a plannable draft with no Yield unit', () => {
    expect(setBaseRecipe(setBaseRecipe(plannable, true), false)).toMatchObject({ baseRecipe: false, yieldUnit: '' })
  })
  it('returns the same draft when the kind already is what was asked', () => {
    expect(setBaseRecipe(plannable, false)).toBe(plannable)
  })
})

describe('words of Base recipe lines and tiles', () => {
  it('labels a line "500 ml Béchamel (Base recipe)"', () => {
    expect(baseLineLabel('500 ml', 'béchamel')).toBe('500 ml Béchamel (Base recipe)')
  })
  it('states a Yield with its unit', () => {
    expect(yieldText(1, 'l')).toBe('1 l')
    expect(yieldText(300, 'g')).toBe('300 g')
    expect(yieldText(8, 'portion')).toBe('8 portions')
    expect(yieldText(1, 'portion')).toBe('1 portion')
    expect(yieldText(4, null)).toBe('4 portions')
  })
  it('words "Used in" and "Not used yet"', () => {
    expect(usedInText(3)).toBe('Used in 3 Recipes')
    expect(usedInText(1)).toBe('Used in 1 Recipe')
    expect(usedInText(0)).toBe('Not used yet')
  })
  it('gives a Base recipe tile its Yield and Used in lines, and a plannable tile none', () => {
    expect(baseTileMeta(summary({ baseRecipe: true, yield: 1, yieldUnit: 'l', usedByCount: 3 }))).toEqual({ yield: 'Yield 1 l', usedIn: 'Used in 3 Recipes' })
    expect(baseTileMeta(summary({ baseRecipe: true, yield: 2, yieldUnit: 'kg', usedByCount: 0 }))).toEqual({ yield: 'Yield 2 kg', usedIn: 'Not used yet' })
    expect(baseTileMeta(summary())).toBeNull()
  })
})

describe('Needed at', () => {
  const steps = [
    { text: 'Marinate', kind: 'advance' as const },
    { text: 'Boil the pasta', kind: 'active' as const },
    { text: 'Layer the lasagne with béchamel and bake for forty minutes', kind: 'passive' as const },
  ]
  it('lists the non-Advance Steps; the first is "Before you start"; the default is marked', () => {
    const o = neededAtOptions(steps, 2)
    expect(o).toEqual([
      { value: 1, label: 'Before you start' },
      { value: 2, label: 'Step 3: Layer the lasagne with béchamel and bake… (default)' },
    ])
  })
  it('marks nothing when the default is unknown', () => {
    expect(neededAtOptions(steps, null).every((o) => !o.label.includes('(default)'))).toBe(true)
  })
  it('a Recipe with no Steps has the one choice "Before you start"', () => {
    expect(neededAtOptions([], null)).toEqual([{ value: 0, label: 'Before you start' }])
  })
  it('words the chip: the first non-Advance Step is "Before you start", the others "Needed at Step N" (N counts every Step)', () => {
    expect(neededAtLabel(steps, 1)).toBe('Before you start')
    expect(neededAtLabel(steps, 2)).toBe('Needed at Step 3')
    expect(neededAtLabel([], 0)).toBe('Before you start')
  })
})

describe('linking a draft line (the editor saves it with the Recipe)', () => {
  const d = { ...emptyDraft(), lines: [line(), line({ key: 'l2', ingredientId: 8, ingredientName: 'flour', quantity: '100', unit: 'g' })] }
  const bech = { id: 3, name: 'Béchamel', ingredientId: 30 }
  it('re-points the line to the Base recipe and remembers the old Ingredient; amount, unit, optional and note carry over', () => {
    const next = linkDraftLine(d, 'l1', bech)
    expect(next.lines[0]).toMatchObject({
      key: 'l1', baseRecipeId: 3, baseRecipeName: 'Béchamel', ingredientId: 30, ingredientName: 'Béchamel', linkedFromIngredientId: 5, neededAtStep: null,
      quantity: '500', unit: 'ml', optional: true, note: 'warm',
    })
    expect(next.lines[1]).toBe(d.lines[1])
    expect(d.lines[0]?.baseRecipeId).toBeUndefined()
  })
  it('ignores an unknown key', () => {
    expect(linkDraftLine(d, 'nope', bech)).toBe(d)
  })
  it('goes back to the plain Ingredient and clears the Base recipe and Needed at', () => {
    const linked = linkDraftLine(d, 'l1', bech)
    const back = unlinkDraftLine({ ...linked, lines: linked.lines.map((l) => (l.key === 'l1' ? { ...l, neededAtStep: 2 } : l)) }, 'l1', { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] })
    expect(back.lines[0]).toMatchObject({ ingredientId: 5, ingredientName: 'béchamel', quantity: '500', unit: 'ml', optional: true, note: 'warm' })
    expect(back.lines[0]?.baseRecipeId ?? null).toBeNull()
    expect(back.lines[0]?.neededAtStep ?? null).toBeNull()
    expect(back.lines[0]?.linkedFromIngredientId ?? null).toBeNull()
  })
})

describe('the Recipes list kind in the URL', () => {
  it('reads ?kind=base; anything else is Recipes', () => {
    expect(kindFromParams(new URLSearchParams('kind=base'))).toBe('base')
    expect(kindFromParams(new URLSearchParams(''))).toBe('plannable')
    expect(kindFromParams(new URLSearchParams('kind=all'))).toBe('plannable')
    expect(kindFromParams(new URLSearchParams('kind=sauce'))).toBe('plannable')
  })
  it('writes ?kind=base and drops it for Recipes, keeping the other filters', () => {
    expect(withKind(new URLSearchParams('tag=roast'), 'base').toString()).toBe('tag=roast&kind=base')
    expect(withKind(new URLSearchParams('tag=roast&kind=base'), 'plannable').toString()).toBe('tag=roast')
  })
})
