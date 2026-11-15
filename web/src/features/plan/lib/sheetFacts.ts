// B9-38 (PC-09, B9-32 follow-up): the words of the Planned Meal sheet's body. Plain TypeScript, no React.
import type { Leftover } from '../../../lib/leftovers/types'
import type { PlannedMeal } from '../types'

/** The facts line: "1 Batch · 2.75 portions · 45 min · start 18:15" (minutes and start only when the meal has them); "2.75 portions" for a meal served from a Leftover. */
export function sheetFacts(_meal: PlannedMeal): string {
  throw new Error('sheetFacts: not implemented (B9-38)')
}

/**
 * Why a start is outside the cooking times, or on an earlier day (A2), as one sentence for the sheet's body; null when the meal
 * has no start to explain or is no longer planned.
 */
export function startNote(_meal: PlannedMeal): string | null {
  throw new Error('startNote: not implemented (B9-38)')
}

/** The leftover-tone block of a Cooked meal's sheet: "2.5 portions left · Use by Tue" and "1.25 portions planned. 1.25 not planned yet.". */
export function leftoverBlock(_leftover: Leftover, _today: string): { title: string; detail: string } {
  throw new Error('leftoverBlock: not implemented (B9-38)')
}
