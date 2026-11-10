import { describe, expect, it } from 'vitest'
import { draftFromRecipe, draftToInput, emptyDraft, validateDraft, type RecipeDraft } from './draft'
import { recipe } from '../fixtures.test-helper'

// R12: the optional per-Recipe reheat time, typed in whole minutes (1 to 30). Blank = not set (Reheat uses its formula).
const filled = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  ...emptyDraft(),
  name: 'Curry',
  yield: '4',
  lines: [{ key: 'a', ingredientId: 1, ingredientName: 'rice', quantity: '250', unit: 'g', optional: false, note: '' }],
  ...over,
})

describe('the reheat time in the draft', () => {
  it('a blank draft has no reheat time', () => {
    expect(emptyDraft().reheatMinutes).toBe('')
    expect(draftToInput(emptyDraft()).reheatMinutes).toBeNull()
  })

  it('sends the typed minutes as a number and a blank as null', () => {
    expect(draftToInput(filled({ reheatMinutes: ' 5 ' })).reheatMinutes).toBe(5)
    expect(draftToInput(filled({ reheatMinutes: '' })).reheatMinutes).toBeNull()
  })

  it('fills the field from a stored Recipe (null becomes blank) and round-trips', () => {
    expect(draftFromRecipe(recipe({ reheatMinutes: 6 })).reheatMinutes).toBe('6')
    expect(draftFromRecipe(recipe({ reheatMinutes: null })).reheatMinutes).toBe('')
    expect(draftFromRecipe(recipe()).reheatMinutes).toBe('')
    expect(draftToInput(draftFromRecipe(recipe({ reheatMinutes: 6 }))).reheatMinutes).toBe(6)
  })

  it('accepts blank and 1 to 30 whole minutes', () => {
    for (const v of ['', '1', '4', '30']) expect(validateDraft(filled({ reheatMinutes: v }))).toEqual({})
  })

  it.each(['0', '-2', '31', '2.5', 'abc', '1/2'])('refuses %j with reheat_invalid on reheatMinutes', (v) => {
    expect(validateDraft(filled({ reheatMinutes: v }))).toEqual({ reheatMinutes: 'reheat_invalid' })
  })
})
