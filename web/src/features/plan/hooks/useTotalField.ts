import { useState } from 'react'
import { parseTotal } from '../lib/cook'
import { planStrings } from '../strings'

/** The Stock total text field: its text, a validation message, and the parsed number on submit. */
export function useTotalField(initial: number, onSave: (total: number) => void) {
  const [text, setText] = useState(String(initial))
  const [error, setError] = useState<string | null>(null)
  return {
    text,
    setText,
    error,
    submit: () => {
      const total = parseTotal(text)
      if (total === null) {
        setError(planStrings.errorTotal)
        return
      }
      setError(null)
      onSave(total)
    },
  }
}
