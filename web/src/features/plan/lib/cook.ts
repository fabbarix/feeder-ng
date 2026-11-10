import type { CookedResult, SlotKey, StockWarning } from '../types'
import { weekdayName } from './phrase'

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

/** none: no Leftover recorded; planned: at least one later meal is served from it; kept: recorded and planned for nothing. */
export function leftoverOutcome(result: CookedResult): LeftoverOutcome {
  const left = result.leftover
  if (!left) return { kind: 'none' }
  if (result.plannedFor.length === 0) return { kind: 'kept', portions: left.portions, useBy: left.useBy }
  return {
    kind: 'planned',
    portions: left.portions,
    useBy: left.useBy,
    meals: result.plannedFor.map((m) => ({ date: m.date, mealSlotName: m.mealSlotName, recipeName: m.recipeName })),
  }
}

/**
 * The sentence the confirmation shows (short weekday names, the Meal Slot name as stored):
 * none: "No Leftovers";
 * kept: "1 portion kept, good until Thu";
 * planned: "2 portions planned for Tue Dinner" (several meals: "... for Tue Dinner and Wed Dinner").
 */
export function leftoverOutcomeText(outcome: LeftoverOutcome): string {
  switch (outcome.kind) {
    case 'none':
      return 'No Leftovers'
    case 'kept':
      return `${formatPortions(outcome.portions)} kept, good until ${weekdayName(outcome.useBy, 'short')}`
    case 'planned': {
      const meals = outcome.meals.map((m) => `${weekdayName(m.date, 'short')} ${m.mealSlotName}`).join(' and ')
      return `${formatPortions(outcome.portions)} planned for ${meals}`
    }
  }
}

/** The Cook Mode route of a Planned Meal: /cook/meal/<date>/<mealSlotId>. */
export function cookPath(_key: SlotKey): string {
  throw new Error('not implemented (WP6)')
}

/**
 * The success toast after Cooked: "Cooked, nice one!" plus where the Leftover went: "... 2 portions → Tue Dinner"
 * (planned), "... 1 portion kept, good until Thu" (kept), nothing more when there is no Leftover.
 */
export function cookedSuccessText(_result: CookedResult): string {
  throw new Error('not implemented (WP6)')
}
