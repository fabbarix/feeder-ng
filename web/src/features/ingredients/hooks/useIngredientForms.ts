import { useEffect, useState } from 'react'
import type { BaseUnit } from '../../../lib/units'
import { checkConversion, parseShelfLife } from '../lib/conversionForm'
import { parseRestockText, restockText } from '../lib/kind'
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

export interface RestockForm {
  /** The field's text: the Base Unit amount, blank for none. */
  text: string
  setText: (v: string) => void
  /** Message for the last save attempt, else null. */
  error: string | null
  /** Parses the text; a bad amount sets the error, otherwise onSave(level | null). */
  submit: () => void
  clear: () => void
}

/** The Restock level field of a Supply: follows the saved level, saves in Base Units (H5, decision D3). */
export function useRestockForm(level: number | null, onSave: (level: number | null) => void): RestockForm {
  const [text, setTextState] = useState(restockText(level))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTextState(restockText(level))
    setError(null)
  }, [level])

  const save = (raw: string) => {
    const parsed = parseRestockText(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    onSave(parsed.value)
  }

  return {
    text,
    setText: (v) => {
      setTextState(v)
      setError(null)
    },
    error,
    submit: () => save(text),
    clear: () => save(''),
  }
}
