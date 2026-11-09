import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { StockWarning } from '../types'

/**
 * The Set total prefill for the one-tap correction: what Stock holds after the Cooked
 * meal. A warning means Stock floored at 0, so this is 0 in practice.
 */
export function correctionDefault(warning: StockWarning): number {
  return Math.max(0, warning.have - warning.need)
}

/** The shortfall sentence in the User's unit system (same wording as the server's message). */
export function shortfallMessage(warning: StockWarning, system: UnitSystem = 'metric'): string {
  const need = formatQuantity(warning.need, warning.baseUnit, system)
  if (warning.have <= 0) return `Stock shows no ${warning.name}, the recipe uses ${need}`
  return `Stock shows only ${formatQuantity(warning.have, warning.baseUnit, system)} ${warning.name}, the recipe uses ${need}`
}
