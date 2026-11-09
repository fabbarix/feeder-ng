import type { BaseUnit } from '../../../lib/units'
import type { Conversion } from '../types'

export type ConversionCheck = { ok: true; value: Conversion } | { ok: false; error: string }

/**
 * Validates the "add conversion" form. `amount` is the raw text; "," is accepted as the decimal
 * mark. The amount is always in the Base Unit (metric), whatever the display system.
 * The unit is trimmed and lower-cased. Errors are the strings in strings.errors:
 * empty unit, the Base Unit itself (case-insensitive), a unit already in `existingUnits`,
 * an amount that is not a finite number > 0.
 */
export function checkConversion(unit: string, amount: string, base: BaseUnit, existingUnits: readonly string[]): ConversionCheck {
  void unit
  void amount
  void base
  void existingUnits
  throw new Error('TODO')
}

/** Parses the Shelf Life field: '' -> null (none); a whole number >= 1 -> that; anything else -> undefined (invalid). */
export function parseShelfLife(text: string): number | null | undefined {
  void text
  throw new Error('TODO')
}
