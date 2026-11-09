import type { IngredientStock } from '../types'

export type GoOffTone = 'spoil' | 'neutral'
export interface GoOffDescription {
  label: string
  tone: GoOffTone
}

/** Days within which a lot counts as "use soon" (matches the server's stock.UseSoonDays). */
export const USE_SOON_DAYS = 3

/**
 * Words for a go-off date relative to today (both YYYY-MM-DD):
 * null -> "No go-off date" (neutral); past -> "Went off yesterday" / "Went off 3 days ago" (spoil);
 * 0 -> "Goes off today"; 1 -> "Goes off tomorrow"; 2..3 -> "Goes off in 3 days" (spoil);
 * further -> "Goes off in 12 days" (neutral).
 */
export function describeGoOff(goesOff: string | null, today: string): GoOffDescription {
  void goesOff
  void today
  throw new Error('TODO')
}

/** Whole days from a to b (YYYY-MM-DD), DST-safe. */
export function daysBetween(a: string, b: string): number {
  void a
  void b
  throw new Error('TODO')
}

/** Ingredients with spoiled Stock Lots first, then use-soon, then by name (case-insensitive). Does not mutate. */
export function sortTotals(items: IngredientStock[]): IngredientStock[] {
  void items
  throw new Error('TODO')
}
