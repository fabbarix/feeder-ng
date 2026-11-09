import type { ApiError } from '../../../lib/http'
import type { BaseUnit } from '../types'

/** What the editor needs to ask for a Unit Conversion inline. */
export interface UnitPrompt {
  /** 'lines[1].unit' or 'steps[0].uses[2].unit', as sent by the server. */
  field: string
  /** Index into the draft's lines, or null when the problem is in a Step's `uses`. */
  lineIndex: number | null
  /** [stepIndex, useIndex] when the problem is in a Step's `uses`. */
  useRef: [number, number] | null
  ingredientId: number
  ingredientName: string
  unit: string
  baseUnit: BaseUnit
}

/**
 * Reads the 422 `unknown_unit` error (details: field, ingredientId, ingredient, unit, baseUnit) into a
 * prompt. Returns null for any other error or malformed details.
 */
export function parseUnknownUnit(_err: unknown): UnitPrompt | null {
  throw new Error('TODO')
}

/** "How many g is 1 clove of garlic?" text parts for the prompt. */
export function promptQuestion(_p: UnitPrompt): string {
  throw new Error('TODO')
}

/** The typed conversion: a number > 0 (parseNumber rules), else null. */
export function parseToBase(_text: string): number | null {
  throw new Error('TODO')
}

export type { ApiError }
