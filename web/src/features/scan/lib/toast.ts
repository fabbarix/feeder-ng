// Text of the line shown after a scan: "Passata +700 g · $1.59" (the buttons ✎ and Undo sit beside it).
// Plain TypeScript, no React. Stubs until implemented.
import type { UnitSystem } from '../../../lib/units'
import type { BaseUnit } from '../types'

export interface FeedbackInput {
  ingredientName: string
  /** Base Units */
  quantity: number
  baseUnit: BaseUnit
  priceCents: number | null
  currency: string
  onList: boolean
}

/**
 * "<Ingredient> +<quantity> · <price>" with the quantity via lib/units formatQuantity and the price via
 * products/lib/money formatMinor; the price part is left out when there is none; " · not on the list" is appended
 * for an off-list scan. The Ingredient name is shown as stored (capitalised only when it already is).
 */
export function feedbackText(input: FeedbackInput, system: UnitSystem = 'metric'): string {
  void input
  void system
  throw new Error('not implemented')
}
