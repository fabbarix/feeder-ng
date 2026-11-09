// Checks the "Add an extra" sheet's fields (no React): either free text or an Ingredient with a quantity above 0.
import { parseAmount } from '../../stock/lib/amount'
import type { ExtraInput } from '../types'

export type ExtraDraftError = 'required' | 'bothFilled' | 'mustBePositive'

export interface ExtraDraft {
  text: string
  ingredientId: number | null
  quantityText: string
}

export type ExtraDraftResult = { ok: true; input: ExtraInput } | { ok: false; error: ExtraDraftError }

/** { text } when only the text is filled; { ingredientId, quantity } for an Ingredient with a quantity above 0. */
export function checkExtraDraft(draft: ExtraDraft): ExtraDraftResult {
  const text = draft.text.trim().replace(/\s+/g, ' ')
  const hasIngredient = draft.ingredientId !== null
  if (text === '' && !hasIngredient) return { ok: false, error: 'required' }
  if (text !== '' && hasIngredient) return { ok: false, error: 'bothFilled' }
  if (text !== '') return { ok: true, input: { text } }
  const amount = parseAmount(draft.quantityText, 'positive')
  if (!amount.ok) return { ok: false, error: 'mustBePositive' }
  return { ok: true, input: { ingredientId: draft.ingredientId as number, quantity: amount.value } }
}
