// XS: the Add to Shopping List sheet picks ONE mode (an Ingredient with a quantity, or a note), so a draft is checked
// for the mode it is in; "text and Ingredient together" can no longer happen.
import { describe, expect, it } from 'vitest'
import { checkExtraDraft } from './extraDraft'

const base = { text: '', ingredientId: null, quantityText: '' }

describe('checkExtraDraft: note mode', () => {
  it('returns the trimmed, single-spaced text', () => {
    expect(checkExtraDraft({ ...base, mode: 'note', text: '  toilet   paper ' })).toEqual({ ok: true, input: { text: 'toilet paper' } })
  })
  it('needs text', () => {
    expect(checkExtraDraft({ ...base, mode: 'note', text: '   ' })).toEqual({ ok: false, field: 'text', error: 'required' })
  })
  it('ignores a leftover Ingredient and quantity from the other mode', () => {
    expect(checkExtraDraft({ mode: 'note', text: 'candles', ingredientId: 3, quantityText: '5' })).toEqual({ ok: true, input: { text: 'candles' } })
  })
})

describe('checkExtraDraft: Ingredient mode', () => {
  it('returns the Ingredient and the quantity', () => {
    expect(checkExtraDraft({ ...base, mode: 'ingredient', ingredientId: 1, quantityText: '2000' })).toEqual({ ok: true, input: { ingredientId: 1, quantity: 2000 } })
  })
  it('accepts a decimal comma', () => {
    expect(checkExtraDraft({ ...base, mode: 'ingredient', ingredientId: 1, quantityText: '2,5' })).toEqual({ ok: true, input: { ingredientId: 1, quantity: 2.5 } })
  })
  it('needs an Ingredient, reported on the Ingredient field', () => {
    expect(checkExtraDraft({ ...base, mode: 'ingredient', quantityText: '5' })).toEqual({ ok: false, field: 'ingredient', error: 'chooseIngredient' })
  })
  it.each(['', '0', '-3', 'abc'])('needs a quantity above 0 (%j), reported on the quantity field', (quantityText) => {
    expect(checkExtraDraft({ ...base, mode: 'ingredient', ingredientId: 1, quantityText })).toEqual({ ok: false, field: 'quantity', error: 'mustBePositive' })
  })
  it('ignores leftover text from the other mode', () => {
    expect(checkExtraDraft({ mode: 'ingredient', text: 'candles', ingredientId: 1, quantityText: '5' })).toEqual({ ok: true, input: { ingredientId: 1, quantity: 5 } })
  })
})
