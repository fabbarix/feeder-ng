import type { BaseUnit } from '../../../lib/units'
import type { Conversion } from '../types'

export interface ConversionForm {
  unit: string
  amount: string
  setUnit: (v: string) => void
  setAmount: (v: string) => void
  /** Message from checkConversion for the last submit attempt, else null. */
  error: string | null
  /** Validates; on success calls onAdd with the cleaned value and clears the fields. */
  submit: () => void
}

export function useConversionForm(base: BaseUnit, existingUnits: readonly string[], onAdd: (c: Conversion) => void): ConversionForm {
  void base
  void existingUnits
  void onAdd
  throw new Error('TODO')
}

export interface ShelfLifeForm {
  text: string
  setText: (v: string) => void
  error: string | null
  /** parseShelfLife; invalid -> error, otherwise onSave(days|null). */
  submit: () => void
  clear: () => void
}

export function useShelfLifeForm(days: number | null, onSave: (days: number | null) => void): ShelfLifeForm {
  void days
  void onSave
  throw new Error('TODO')
}
