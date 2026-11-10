import { describe, expect, it } from 'vitest'
import { emptyDraft, validateDraft, type RecipeDraft, type StepDraft } from './draft'

const stepWith = (uses: StepDraft['uses']): StepDraft => ({
  key: 's', text: 'Roast', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses, image: '',
})
const draftWith = (uses: StepDraft['uses']): RecipeDraft => ({
  ...emptyDraft(),
  name: 'Aioli',
  lines: [{ key: 'l', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' }],
  steps: [stepWith(uses)],
})

describe('validateDraft: Step uses', () => {
  it('accepts a complete use', () => {
    expect(validateDraft(draftWith([{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '2', unit: 'clove' }]))).toEqual({})
  })
  it('asks for the Ingredient, the quantity and the unit of each use', () => {
    const errors = validateDraft(draftWith([{ key: 'u1', ingredientId: null, ingredientName: '', quantity: '0', unit: '' }]))
    expect(errors).toMatchObject({
      'steps.0.uses.0.ingredient': 'ingredient_required',
      'steps.0.uses.0.quantity': 'quantity_invalid',
      'steps.0.uses.0.unit': 'unit_required',
    })
  })
  it('reports the use that is wrong, not its neighbours', () => {
    const errors = validateDraft(
      draftWith([
        { key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '1', unit: 'clove' },
        { key: 'u2', ingredientId: 7, ingredientName: 'garlic', quantity: 'x', unit: 'clove' },
      ]),
    )
    expect(Object.keys(errors)).toEqual(['steps.0.uses.1.quantity'])
  })
})
