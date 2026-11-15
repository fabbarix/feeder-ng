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

// ---- B9-45 (PC-02): the one Stock-shortfall notice and the one Correct Stock sheet. STUBS: the developer builds them. ----

/** One Cooked meal's Stock warnings: the notice lists them as rows, grouped by meal (amounts are never summed across Recipes). */
export interface ShortfallGroup {
  /** Unique per Cooked meal: "2026-11-14/3/1" (date/slot/Course); "2026-11-14/3" for a Mark all Cooked. */
  id: string
  /** "Sat Dinner". */
  mealLabel: string
  /** The Recipe that was cooked; null when the warnings of several Recipes arrive together (a Mark all Cooked of several Courses). */
  recipeName: string | null
  warnings: StockWarning[]
}

/** One row of the notice: key (name), state at the end ("none in Stock", "200 g short"), muted detail. */
export interface ShortfallRow {
  /** `${group.id}:${ingredientId}`. */
  key: string
  groupId: string
  ingredientId: number
  name: string
  state: string
  detail: string
}

/** One row of the Correct Stock sheet: one per Ingredient, however many Recipes used it. */
export interface CorrectionRow {
  ingredientId: number
  name: string
  baseUnit: StockWarning['baseUnit']
  /** "The Recipe used 1 kg · Stock showed none". */
  detail: string
}

const notBuilt = (): never => {
  throw new Error('B9-45: not built yet')
}

/** "none in Stock" (nothing was in Stock), else "<missing> short" ("200 g short"). */
export function shortfallState(_warning: StockWarning, _system: UnitSystem = 'metric'): string {
  return notBuilt()
}

/** "The Recipe used 300 g · Stock showed 100 g"; with nothing in Stock the second part is left out (the state says it). `subject` is "The Recipe", a Recipe name or "Cooking". */
export function shortfallDetail(_warning: StockWarning, _system: UnitSystem, _subject: string): string {
  return notBuilt()
}

/** One row per Ingredient and group, in group order. The subject is "The Recipe" while one Recipe is named across the groups, each Recipe's own name when several are, "Cooking" for a null recipeName. */
export function shortfallRows(_groups: ShortfallGroup[], _system?: UnitSystem): ShortfallRow[] {
  return notBuilt()
}

/** "Stock was short for Cauliflower" (one Ingredient) or "Stock was short for 3 Ingredients" (distinct Ingredients). */
export function shortfallTitle(_groups: ShortfallGroup[]): string {
  return notBuilt()
}

/** The Correct Stock sheet's rows: one per distinct Ingredient, first seen first. */
export function correctionRows(_groups: ShortfallGroup[], _system?: UnitSystem): CorrectionRow[] {
  return notBuilt()
}

/** The Stepper step of a row, in Base Units: g and ml 10, piece 1. */
export function correctionStep(_baseUnit: StockWarning['baseUnit']): number {
  return notBuilt()
}

/** One Stock-take per changed row: the rows whose value is above 0 (0 is where Stock stays). */
export function correctionWrites(_rows: CorrectionRow[], _values: Record<number, number>): { ingredientId: number; total: number }[] {
  return notBuilt()
}

/** "Stock corrected for 2 Ingredients" ("... for 1 Ingredient"). */
export function correctedText(_count: number): string {
  return notBuilt()
}
