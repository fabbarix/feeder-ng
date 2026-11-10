import { describe, expect, it } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import { draftToInput, emptyDraft, pickCreatedIngredient, pickIngredient, updateLine, validateDraft, type LineDraft, type RecipeDraft } from './draft'
import type { IngredientRef } from '../types'

const pending = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'p', ingredientId: null, ingredientName: 'Lasagne pack', quantity: '1', unit: 'piece', optional: false, note: '', auto: true, ...over,
})
const readyDraft = (lines: LineDraft[]): RecipeDraft => ({ ...emptyDraft(), name: 'Lasagne pack', yield: '2', readyMeal: true, lines })

describe('a pending Ready Meal line in the draft', () => {
  it('passes validation: the Ingredient does not exist yet, so no Ingredient error', () => {
    expect(validateDraft(readyDraft([pending()]))).toEqual({})
  })
  it('is sent as no lines, so the server creates or reuses the Ingredient on save', () => {
    const input = draftToInput(readyDraft([pending()]))
    expect(input.readyMeal).toBe(true)
    expect(input.lines).toEqual([])
  })
  it('still sends a reused Ingredient as a normal line', () => {
    const input = draftToInput(readyDraft([pending({ ingredientId: 21 })]))
    expect(input.lines).toEqual([{ ingredientId: 21, quantity: 1, unit: 'piece', optional: false, note: '' }])
  })
  it('is an ordinary missing-Ingredient error when it is not automatic', () => {
    expect(validateDraft(readyDraft([pending({ auto: false })]))).toMatchObject({ 'lines.0.ingredient': 'ingredient_required' })
  })
  it('is not accepted for a Recipe that is not a Ready Meal', () => {
    expect(validateDraft({ ...readyDraft([pending()]), readyMeal: false })).toMatchObject({ 'lines.0.ingredient': 'ingredient_required' })
  })
  it('does not count towards "exactly one line" twice', () => {
    expect(validateDraft(readyDraft([pending(), pending({ key: 'q', auto: false, ingredientId: 7, ingredientName: 'garlic' })]))).toMatchObject({ lines: 'ready_meal_lines' })
  })
})

describe('the User takes over an automatic line', () => {
  const reuse = pending({ ingredientId: 21 })
  it('picking another Ingredient clears auto', () => {
    const next = pickIngredient(readyDraft([reuse]), 'p', garlic)
    expect(next.lines[0]!.auto).toBeFalsy()
  })
  it('editing quantity or unit clears auto', () => {
    expect(updateLine(readyDraft([reuse]), 'p', { quantity: '2' }).lines[0]!.auto).toBeFalsy()
    expect(updateLine(readyDraft([reuse]), 'p', { unit: 'g' }).lines[0]!.auto).toBeFalsy()
  })
  it('editing only the note keeps the line automatic', () => {
    expect(updateLine(readyDraft([reuse]), 'p', { note: 'family size' }).lines[0]!.auto).toBe(true)
  })
})

describe('pickCreatedIngredient', () => {
  const saffron: IngredientRef = { id: 99, name: 'Saffron', baseUnit: 'g', conversions: [] }
  const line = (unit: string): LineDraft => ({ key: 'l1', ingredientId: null, ingredientName: '', quantity: '0.5', unit, optional: false, note: '' })
  const draftWith = (unit: string): RecipeDraft => ({ ...emptyDraft(), lines: [line(unit)] })

  it('selects the new Ingredient and keeps the quantity', () => {
    expect(pickCreatedIngredient(draftWith(''), 'l1', saffron).lines[0]).toMatchObject({ ingredientId: 99, ingredientName: 'Saffron', quantity: '0.5' })
  })
  it('keeps the unit the line already had (the Ingredient was made to fit it)', () => {
    expect(pickCreatedIngredient(draftWith('clove'), 'l1', saffron).lines[0]!.unit).toBe('clove')
  })
  it('falls back to the Base Unit when the line had no unit', () => {
    expect(pickCreatedIngredient(draftWith(''), 'l1', saffron).lines[0]!.unit).toBe('g')
  })
  it('changes nothing else in the draft', () => {
    const d = { ...draftWith('g'), name: 'Paella', description: 'Saturday' }
    const next = pickCreatedIngredient(d, 'l1', saffron)
    expect({ ...next, lines: [] }).toEqual({ ...d, lines: [] })
  })
})
