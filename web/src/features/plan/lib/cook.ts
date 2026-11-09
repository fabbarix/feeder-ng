import type { StockWarning } from '../types'

export const LEFTOVER_STEP = 0.5

/** The ± control: moves value by direction x step, clamped to [0, max]. */
export function adjustLeftover(value: number, direction: 1 | -1, max: number, step: number = LEFTOVER_STEP): number {
  void [value, direction, max, step]
  throw new Error('TODO: developer')
}

/** "1 portion", "1.5 portions", "2 portions", "0 portions". */
export function formatPortions(n: number): string {
  void [n]
  throw new Error('TODO: developer')
}

export interface Correction {
  ingredientId: number
  ingredient: string
  /** The prefilled total: what Stock holds after the floored deduction (0). */
  total: number
}

/** What "Correct Stock" offers for a shortfall warning. */
export function correctionFor(warning: StockWarning): Correction {
  void [warning]
  throw new Error('TODO: developer')
}

/** Parses the number a User types for a Stock total; null when it is not a non-negative number. Accepts a comma as the decimal mark. */
export function parseTotal(text: string): number | null {
  void [text]
  throw new Error('TODO: developer')
}
