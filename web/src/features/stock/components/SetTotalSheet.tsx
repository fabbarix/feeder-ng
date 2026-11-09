import { useId, useState, type FormEvent, type ReactElement } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { parseAmount } from '../lib/amount'
import type { BaseUnit } from '../types'
import { stockStrings as strings } from '../strings'

export interface SetTotalSheetProps {
  open: boolean
  onClose: () => void
  name: string
  baseUnit: BaseUnit
  /** Prefilled amount (the current total, or 0 for a Stock correction). */
  initial: number
  onSubmit: (total: number) => void
}

/**
 * BottomSheet "Set total for <name>" with an input labelled "New total" and a Save button.
 * Uses parseAmount(text, 'nonNegative'); an invalid entry shows its error text and does not submit.
 */
export function SetTotalSheet({ open, onClose, name, baseUnit, initial, onSubmit }: SetTotalSheetProps): ReactElement | null {
  const inputId = useId()
  const [text, setText] = useState(String(initial))
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = parseAmount(text, 'nonNegative')
    if (!amount.ok) {
      setError(strings.errors[amount.error])
      return
    }
    setError(null)
    onSubmit(amount.value)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={strings.setTotalTitle(name)}>
      <form className="stock-form" onSubmit={submit}>
        <label htmlFor={inputId}>{strings.newTotal}</label>
        <span className="stock-form__amount">
          <input id={inputId} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
          <span className="stock-form__unit">{baseUnit}</span>
        </span>
        {error ? <p role="alert">{error}</p> : null}
        <Button type="submit">{strings.save}</Button>
      </form>
    </BottomSheet>
  )
}
