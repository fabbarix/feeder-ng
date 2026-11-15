// The Cook / Batch entry of Recipe detail (QA B2, G2): the Batch bounds and the amount text. Plain TypeScript.
import { formatQuantity, grouped, type UnitSystem } from '../../../lib/units'

export const MIN_BATCHES = 1
export const MAX_BATCHES = 10

/** Portions of `batches` Batches of a Recipe with Yield `yieldValue`, as text without trailing zeros ("8", "7.5"). */
export function batchPortions(yieldValue: number, batches: number): string {
  return String(Number((yieldValue * batches).toFixed(2)))
}

/** The amount of Yield `batches` Batches make, in the base of its unit: g, ml, piece, or 'portion' (a plannable Recipe, or the unit portion). */
export interface BatchAmount {
  quantity: number
  unit: 'g' | 'ml' | 'piece' | 'portion'
}

/** Each Yield unit in the base it is shown in, and how many of that base one of it is (mirrors internal/units). */
const TO_BASE: Record<string, { unit: BatchAmount['unit']; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  dl: { unit: 'ml', factor: 100 },
  cl: { unit: 'ml', factor: 10 },
  tsp: { unit: 'ml', factor: 5 },
  tbsp: { unit: 'ml', factor: 15 },
  cup: { unit: 'ml', factor: 240 },
  piece: { unit: 'piece', factor: 1 },
}

const clean = (n: number) => Number(n.toFixed(6))

/** RX-06: the scaled Yield in base units, for the same formatter as the Ingredient lines. A missing or unknown unit is portions. */
export function batchAmount(yieldValue: number, yieldUnit: string | null | undefined, batches: number): BatchAmount {
  const base = yieldUnit ? TO_BASE[yieldUnit.trim().toLowerCase()] : undefined
  if (!base) return { quantity: clean(yieldValue * batches), unit: 'portion' }
  return { quantity: clean(yieldValue * base.factor * batches), unit: base.unit }
}

/** RX-06: "1.6 kg", "3 lb 8 oz", "24 pieces", "8 portions", "1 portion" in the User's display system. */
export function batchAmountText(yieldValue: number, yieldUnit: string | null | undefined, batches: number, system: UnitSystem): string {
  const a = batchAmount(yieldValue, yieldUnit, batches)
  if (a.unit === 'portion') return `${grouped(a.quantity, 2)} ${a.quantity === 1 ? 'portion' : 'portions'}`
  return formatQuantity(a.quantity, a.unit, system)
}
