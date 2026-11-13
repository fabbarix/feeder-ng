import { describe, expect, it } from 'vitest'
import { recipe } from '../fixtures.test-helper'
import { linkDraftLine } from './baseRecipe'
import { draftFromRecipe, draftToInput, emptyDraft, type LineDraft } from './draft'
import type { BaseRecipeLineInput, RecipeLine } from '../types'

// BR-D round 3: a save keeps the line ids and the remembered Ingredient (PUT replaces the lines; without them the link back is lost).
const stored = (lines: RecipeLine[]) => recipe({ id: 2, name: 'Lasagne', lines })
const plain: RecipeLine = { id: 11, ingredientId: 9, ingredient: 'milk', quantity: 1000, unit: 'ml', optional: false, note: '' }
const based: RecipeLine = { id: 12, ingredientId: 31, ingredient: 'Roux', quantity: 100, unit: 'g', optional: false, note: '', baseRecipe: { id: 4, name: 'Roux', archived: false }, neededAtStep: null, linkedFromIngredientId: 6 }

describe('draftToInput keeps ids and the remembered Ingredient', () => {
  it('sends the stored id on every line, plain and Base recipe', () => {
    const [p, b] = draftToInput(draftFromRecipe(stored([plain, based]))).lines as [RecipeLine, BaseRecipeLineInput]
    expect(p.id).toBe(11)
    expect(b.id).toBe(12)
  })
  it('sends linkedFromIngredientId on a Base recipe line, and none on a plain line', () => {
    const [p, b] = draftToInput(draftFromRecipe(stored([plain, based]))).lines as unknown as [Record<string, unknown>, BaseRecipeLineInput]
    expect(b.linkedFromIngredientId).toBe(6)
    expect('linkedFromIngredientId' in p).toBe(false)
  })
  it('sends null when the Base recipe line remembers nothing (a take-over line)', () => {
    const [b] = draftToInput(draftFromRecipe(stored([{ ...based, linkedFromIngredientId: null }]))).lines as [BaseRecipeLineInput]
    expect(b.linkedFromIngredientId).toBeNull()
  })
  it('a line added in this edit has no id', () => {
    const d = draftFromRecipe(stored([plain]))
    const line: LineDraft = { key: 'new', ingredientId: 8, ingredientName: 'flour', quantity: '100', unit: 'g', optional: false, note: '' }
    const lines = draftToInput({ ...d, lines: [...d.lines, line] }).lines as unknown as Array<Record<string, unknown>>
    expect('id' in lines[1]!).toBe(false)
  })
  it('a line linked in the editor carries the Ingredient it was linked from', () => {
    const d = { ...emptyDraft(), name: 'Lasagne', lines: [{ key: 'k', id: 11, ingredientId: 5, ingredientName: 'béchamel', quantity: '500', unit: 'ml', optional: false, note: '' } as LineDraft] }
    const linked = linkDraftLine(d, 'k', { id: 3, name: 'Béchamel', ingredientId: 30 })
    const [b] = draftToInput(linked).lines as [BaseRecipeLineInput]
    expect(b).toMatchObject({ id: 11, baseRecipeId: 3, linkedFromIngredientId: 5 })
  })
})

describe('linkDraftLine after a take-over "Yes"', () => {
  it('remembers nothing when the Base recipe\'s Ingredient is the one the line already had', () => {
    const d = { ...emptyDraft(), lines: [{ key: 'k', ingredientId: 5, ingredientName: 'béchamel', quantity: '500', unit: 'ml', optional: false, note: '' } as LineDraft] }
    const next = linkDraftLine(d, 'k', { id: 3, name: 'Béchamel', ingredientId: 5 })
    expect(next.lines[0]?.linkedFromIngredientId ?? null).toBeNull()
    expect(next.lines[0]).toMatchObject({ baseRecipeId: 3, ingredientId: 5 })
  })
})
