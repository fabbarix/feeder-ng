import { useState } from 'react'
import type { BaseUnit } from '../../../lib/units'
import { conversionErrors } from '../lib/conversionForm'
import { errorMessage } from '../lib/errorMessage'
import type { Conversion } from '../types'

export type ConversionFormErrors = {
  unit?: string
  amount?: string
}

export interface ConversionForm {
  unit: string
  amount: string
  setUnit: (v: string) => void
  setAmount: (v: string) => void
  /** SAFE-04: each field's problem from the last Add; each clears as its field is edited. */
  errors: ConversionFormErrors
  /** A refused add (the server), in words: the form's FormError. */
  failure: string | null
  /** Grows on every Add that finds a field error (useFocusFirstInvalid's trigger). */
  submitCount: number
  /** Validates; on success calls onAdd with the cleaned value and clears the fields once it resolves; a rejection keeps them. */
  submit: () => Promise<void>
}

export function useConversionForm(base: BaseUnit, existingUnits: readonly string[], onAdd: (c: Conversion) => unknown): ConversionForm {
  const [unit, setUnitText] = useState('')
  const [amount, setAmountText] = useState('')
  const [errors, setErrors] = useState<ConversionFormErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [submitCount, setSubmitCount] = useState(0)

  const submit = async () => {
    const found = conversionErrors(unit, amount, base, existingUnits)
    setErrors(found)
    setFailure(null)
    if (found.unit || found.amount) {
      setSubmitCount((n) => n + 1)
      return
    }
    const value: Conversion = { unit: unit.trim().toLowerCase(), toBase: Number(amount.trim().replace(',', '.')) }
    try {
      await onAdd(value)
    } catch (e) {
      setFailure(errorMessage(e))
      return
    }
    setUnitText('')
    setAmountText('')
  }

  return {
    unit,
    amount,
    setUnit: (v) => {
      setUnitText(v)
      setErrors((e) => ({ ...e, unit: undefined }))
      setFailure(null)
    },
    setAmount: (v) => {
      setAmountText(v)
      setErrors((e) => ({ ...e, amount: undefined }))
      setFailure(null)
    },
    errors,
    failure,
    submitCount,
    submit,
  }
}
