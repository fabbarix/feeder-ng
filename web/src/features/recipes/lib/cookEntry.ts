// The Cook / Batch entry of Recipe detail (QA B2, G2): the Batch bounds and the portions text. Plain TypeScript.

export const MIN_BATCHES = 1
export const MAX_BATCHES = 10

/** Portions of `batches` Batches of a Recipe with Yield `yieldValue`, as text without trailing zeros ("8", "7.5"). */
export function batchPortions(yieldValue: number, batches: number): string {
  return String(Number((yieldValue * batches).toFixed(2)))
}

/** The amount of Yield `batches` Batches make, in the base of its unit: g, ml, piece, or 'portion' (a plannable Recipe, or the unit portion). STUB (B9-27). */
export interface BatchAmount {
  quantity: number
  unit: 'g' | 'ml' | 'piece' | 'portion'
}

/** STUB (B9-27 test author, RX-06): the developer implements it. */
export function batchAmount(_yieldValue: number, _yieldUnit: string | null | undefined, _batches: number): BatchAmount {
  return { quantity: Number.NaN, unit: 'portion' }
}

/** STUB (B9-27 test author, RX-06): "1.6 kg", "8 portions" in the User's display system. */
export function batchAmountText(_yieldValue: number, _yieldUnit: string | null | undefined, _batches: number, _system: 'metric' | 'imperial'): string {
  return ''
}
