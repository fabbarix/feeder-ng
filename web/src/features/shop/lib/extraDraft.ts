// Checks the Add to Shopping List sheet's fields for the mode it is in (no React). A note is free text; an Ingredient
// is an Ingredient with a quantity above 0. Fields of the other mode are ignored, never sent.
import { parseAmount } from '../../stock/lib/amount'
import type { ExtraInput } from '../types'

export type ExtraMode = 'ingredient' | 'note'
export type ExtraDraftField = 'text' | 'ingredient' | 'quantity'
export type ExtraDraftError = 'required' | 'chooseIngredient' | 'mustBePositive'

export interface ExtraDraft {
  mode: ExtraMode
  text: string
  ingredientId: number | null
  quantityText: string
}

export type ExtraDraftResult = { ok: true; input: ExtraInput } | { ok: false; field: ExtraDraftField; error: ExtraDraftError }

/** { text } for a note; { ingredientId, quantity } for an Ingredient. The first problem found is reported on its field. */
export function checkExtraDraft(draft: ExtraDraft): ExtraDraftResult {
  if (draft.mode === 'note') {
    const text = draft.text.trim().replace(/\s+/g, ' ')
    if (text === '') return { ok: false, field: 'text', error: 'required' }
    return { ok: true, input: { text } }
  }
  if (draft.ingredientId === null) return { ok: false, field: 'ingredient', error: 'chooseIngredient' }
  const amount = parseAmount(draft.quantityText, 'positive')
  if (!amount.ok) return { ok: false, field: 'quantity', error: 'mustBePositive' }
  return { ok: true, input: { ingredientId: draft.ingredientId, quantity: amount.value } }
}
