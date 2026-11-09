import { ApiError } from '../../../lib/http'
import type { BaseUnit } from '../types'
import { recipeStrings } from '../strings'
import { parseNumber } from './draft'

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

const BASE_UNITS: readonly string[] = ['g', 'ml', 'piece']

/**
 * Reads the 422 `unknown_unit` error (details: field, ingredientId, ingredient, unit, baseUnit) into a
 * prompt. Returns null for any other error or malformed details.
 */
export function parseUnknownUnit(err: unknown): UnitPrompt | null {
  if (!(err instanceof ApiError) || err.code !== 'unknown_unit') return null
  const d = err.details
  const field = typeof d.field === 'string' ? d.field : ''
  const ingredientId = typeof d.ingredientId === 'number' ? d.ingredientId : NaN
  const ingredientName = typeof d.ingredient === 'string' ? d.ingredient : ''
  const unit = typeof d.unit === 'string' ? d.unit : ''
  const baseUnit = typeof d.baseUnit === 'string' ? d.baseUnit : ''
  if (!Number.isFinite(ingredientId) || !BASE_UNITS.includes(baseUnit)) return null

  const line = /^lines\[(\d+)\]\.unit$/.exec(field)
  const use = /^steps\[(\d+)\]\.uses\[(\d+)\]\.unit$/.exec(field)
  if (line) {
    return { field, lineIndex: Number(line[1]), useRef: null, ingredientId, ingredientName, unit, baseUnit: baseUnit as BaseUnit }
  }
  if (use) {
    return {
      field,
      lineIndex: null,
      useRef: [Number(use[1]), Number(use[2])],
      ingredientId,
      ingredientName,
      unit,
      baseUnit: baseUnit as BaseUnit,
    }
  }
  return null
}

/** "How many g is 1 clove of garlic?" text parts for the prompt. */
export function promptQuestion(p: UnitPrompt): string {
  return recipeStrings.unitConversion.question(p.unit, p.ingredientName, p.baseUnit)
}

/** The typed conversion: a number > 0 (parseNumber rules), else null. */
export function parseToBase(text: string): number | null {
  const n = parseNumber(text)
  return n !== null && n > 0 ? n : null
}
