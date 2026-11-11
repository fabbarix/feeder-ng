import { useEffect, useState } from 'react'
import type { BaseUnit } from '../../../lib/units'
import { checkConversion, parseShelfLife } from '../lib/conversionForm'
import { strings } from '../strings'
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
  const [unit, setUnitText] = useState('')
  const [amount, setAmountText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const checked = checkConversion(unit, amount, base, existingUnits)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    onAdd(checked.value)
    setUnitText('')
    setAmountText('')
  }

  return {
    unit,
    amount,
    setUnit: (v) => {
      setUnitText(v)
      setError(null)
    },
    setAmount: (v) => {
      setAmountText(v)
      setError(null)
    },
    error,
    submit,
  }
}

export interface ShelfLifeForm {
  /** Whole days, or null while blank (no Shelf Life). */
  value: number | null
  setValue: (v: number | null) => void
  error: string | null
  /** Out of range -> error, otherwise onSave(days|null). */
  submit: () => void
  clear: () => void
}

export function useShelfLifeForm(days: number | null, onSave: (days: number | null) => void): ShelfLifeForm {
  const [value, setValueState] = useState<number | null>(days)
  const [error, setError] = useState<string | null>(null)

  // Follow the saved value when it changes from outside (after a save, or another edit).
  useEffect(() => {
    setValueState(days)
    setError(null)
  }, [days])

  const submit = () => {
    const parsed = value === null ? null : Number.isInteger(value) ? parseShelfLife(String(value)) : undefined
    if (parsed === undefined) {
      setError(strings.errors.daysInvalid)
      return
    }
    setError(null)
    onSave(parsed)
  }

  const clear = () => {
    setError(null)
    setValueState(null)
    onSave(null)
  }

  return {
    value,
    setValue: (v) => {
      setValueState(v === null ? null : Math.round(v))
      setError(null)
    },
    error,
    submit,
    clear,
  }
}
