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
  text: string
  setText: (v: string) => void
  error: string | null
  /** parseShelfLife; invalid -> error, otherwise onSave(days|null). */
  submit: () => void
  clear: () => void
}

export function useShelfLifeForm(days: number | null, onSave: (days: number | null) => void): ShelfLifeForm {
  const [text, setTextValue] = useState(days === null ? '' : String(days))
  const [error, setError] = useState<string | null>(null)

  // Follow the saved value when it changes from outside (after a save, or another edit).
  useEffect(() => {
    setTextValue(days === null ? '' : String(days))
    setError(null)
  }, [days])

  const submit = () => {
    const parsed = parseShelfLife(text)
    if (parsed === undefined) {
      setError(strings.errors.daysInvalid)
      return
    }
    setError(null)
    onSave(parsed)
  }

  const clear = () => {
    setError(null)
    setTextValue('')
    onSave(null)
  }

  return {
    text,
    setText: (v) => {
      setTextValue(v)
      setError(null)
    },
    error,
    submit,
    clear,
  }
}
