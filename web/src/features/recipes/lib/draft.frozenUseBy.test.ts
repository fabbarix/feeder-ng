// B5-LOW: the Recipe's optional Frozen Use-by (1 to 365 days; blank = the Household's) in the editor draft.
import { describe, expect, it } from 'vitest'
import type { Recipe } from '../types'
import { draftFromRecipe, draftToInput, emptyDraft, serverErrorKey, validateDraft } from './draft'

const recipe = (frozenUseByDays: number | null): Recipe => ({
  id: 9, name: 'Soup', description: '', yield: 2, readyMeal: false, courses: [{ id: 1, name: 'Main' }], wholeMeal: false, tags: [],
  cooldownDays: null, leftoverUseByDays: null, frozenUseByDays, reheatMinutes: null, source: { url: '', attribution: '' }, image: '', imageUrl: '',
  lines: [{ ingredientId: 2, ingredient: 'leek', quantity: 2, unit: 'piece', optional: false, note: '' }],
  steps: [{ text: 'Simmer', kind: 'passive', durationMinutes: 20, leadTimeMinutes: 0, after: [], uses: [], image: '' }],
  archived: false, totalMinutes: 20, advanceMinutes: 0, advance: [], createdAt: '', updatedAt: '', lastCookedOn: null,
} as Recipe)

const valid = (frozenUseByDays: string) => {
  const d = emptyDraft()
  return {
    ...d, name: 'Soup', yield: '2', frozenUseByDays,
    lines: [{ key: 'l', ingredientId: 2, ingredientName: 'leek', quantity: '2', unit: 'piece', optional: false, note: '' }],
    steps: [{ key: 's', text: 'Simmer', kind: 'active' as const, durationMinutes: '', leadTimeMinutes: '', after: [], uses: [], image: '' }],
  }
}

describe('Recipe draft: Frozen Use-by', () => {
  it('starts blank', () => {
    expect(emptyDraft().frozenUseByDays).toBe('')
  })
  it('reads the Recipe: null is blank, a number is its text', () => {
    expect(draftFromRecipe(recipe(null)).frozenUseByDays).toBe('')
    expect(draftFromRecipe(recipe(60)).frozenUseByDays).toBe('60')
  })
  it('writes null when blank and the number otherwise, always sending the key', () => {
    expect(draftToInput(valid(''))).toHaveProperty('frozenUseByDays', null)
    expect(draftToInput(valid(' 45 '))).toHaveProperty('frozenUseByDays', 45)
  })
  it.each(['1', '90', '365', ''])('accepts %j', (v) => {
    expect(validateDraft(valid(v)).frozenUseByDays).toBeUndefined()
  })
  it.each(['0', '366', '-2', '1.5', 'abc'])('rejects %j with frozen_use_by_invalid', (v) => {
    expect(validateDraft(valid(v)).frozenUseByDays).toBe('frozen_use_by_invalid')
  })
  it('maps the server reason onto the field', () => {
    expect(serverErrorKey('frozenUseByDays', 'frozen_use_by_invalid')).toBe('frozenUseByDays')
  })
})
