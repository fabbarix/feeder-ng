import type { CookedResult, StockWarning } from '../types'

export const LEFTOVER_STEP = 0.5

/** The ± control: moves value by direction x step, clamped to [0, max]. */
export function adjustLeftover(value: number, direction: 1 | -1, max: number, step: number = LEFTOVER_STEP): number {
  return Math.min(max, Math.max(0, value + direction * step))
}

/** "1 portion", "1.5 portions", "2 portions", "0 portions". */
export function formatPortions(n: number): string {
  return n === 1 ? '1 portion' : `${n} portions`
}

export interface Correction {
  ingredientId: number
  ingredient: string
  /** The prefilled total: what Stock holds after the floored deduction (0). */
  total: number
}

/** What "Correct Stock" offers for a shortfall warning. */
export function correctionFor(warning: StockWarning): Correction {
  return { ingredientId: warning.ingredientId, ingredient: warning.name, total: 0 }
}

/** Parses the number a User types for a Stock total; null when it is not a non-negative number. Accepts a comma as the decimal mark. */
export function parseTotal(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** Where the Leftover of a Cooked meal went (R4 B13). */
export type LeftoverOutcome =
  | { kind: 'none' }
  | { kind: 'kept'; portions: number; useBy: string }
  | { kind: 'planned'; portions: number; useBy: string; meals: { date: string; mealSlotName: string; recipeName: string }[] }

/** none: no Leftover recorded; planned: at least one later meal is served from it; kept: recorded and planned for nothing. STUB. */
export function leftoverOutcome(result: CookedResult): LeftoverOutcome {
  void result
  return { kind: 'none' }
}

/**
 * The sentence the confirmation shows (short weekday names, the Meal Slot name as stored):
 * none: "No Leftovers";
 * kept: "1 portion kept, good until Fri";
 * planned: "2 portions planned for Tue Dinner" (several meals: "... for Tue Dinner and Wed Dinner").
 * STUB (red tests): the Developer implements it.
 */
export function leftoverOutcomeText(outcome: LeftoverOutcome): string {
  void outcome
  return ''
}
