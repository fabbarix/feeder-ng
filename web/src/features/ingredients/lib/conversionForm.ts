import type { BaseUnit } from '../../../lib/units'
import { strings } from '../strings'
import type { Conversion } from '../types'

export type ConversionCheck = { ok: true; value: Conversion } | { ok: false; error: string }

/** The largest Shelf Life the server accepts, in days (mirrors ingredient.MaxShelfLifeDays). */
export const MAX_SHELF_LIFE_DAYS = 3650

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/
const WHOLE = /^\d+$/

/**
 * Validates the "add conversion" form. `amount` is the raw text; "," is accepted as the decimal
 * mark. The amount is always in the Base Unit (metric), whatever the display system.
 * The unit is trimmed and lower-cased. Errors are the strings in strings.errors:
 * empty unit, the Base Unit itself (case-insensitive), a unit already in `existingUnits`,
 * an amount that is not a finite number > 0.
 */
export function checkConversion(
  unit: string,
  amount: string,
  base: BaseUnit,
  existingUnits: readonly string[],
): ConversionCheck {
  const u = unit.trim().toLowerCase()
  if (u === '') return { ok: false, error: strings.errors.unitRequired }
  if (u === base) return { ok: false, error: strings.errors.unitIsBase(base) }
  if (existingUnits.some((e) => e.trim().toLowerCase() === u)) return { ok: false, error: strings.errors.unitTaken }

  const text = amount.trim().replace(',', '.')
  const n = DECIMAL.test(text) ? Number(text) : Number.NaN
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: strings.errors.amountInvalid }
  return { ok: true, value: { unit: u, toBase: n } }
}

/** Parses the Shelf Life field: '' -> null (none); a whole number >= 1 -> that; anything else -> undefined (invalid). */
export function parseShelfLife(text: string): number | null | undefined {
  const t = text.trim()
  if (t === '') return null
  if (!WHOLE.test(t)) return undefined
  const n = Number(t)
  return n >= 1 && n <= MAX_SHELF_LIFE_DAYS ? n : undefined
}
