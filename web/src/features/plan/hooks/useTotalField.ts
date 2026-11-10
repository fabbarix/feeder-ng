import { useState } from 'react'
import { planStrings } from '../strings'

/** The Stock total field: its number (null while empty), a validation message, and the number on submit. */
export function useTotalField(initial: number, onSave: (total: number) => void) {
  const [value, setValue] = useState<number | null>(initial)
  const [error, setError] = useState<string | null>(null)
  return {
    value,
    setValue,
    error,
    submit: () => {
      if (value === null || value < 0) {
        setError(planStrings.errorTotal)
        return
      }
      setError(null)
      onSave(value)
    },
  }
}
