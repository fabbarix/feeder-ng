import type { StockWarning } from '../types'

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
