import { useState, type ReactElement } from 'react'
import { BottomSheet, Button, TextField } from '../../../ui'
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
 * BottomSheet "Set total for <name>" with a `TextField` labelled "New total" (prefilled with `initial`, inputMode
 * decimal, `suffix` = baseUnit, parseAmount 'nonNegative', error inline via the field) and a primary Save in the
 * sheet `footer`. An invalid entry shows its error and does not submit.
 */
export function SetTotalSheet({ open, onClose, name, baseUnit, initial, onSubmit }: SetTotalSheetProps): ReactElement | null {
  const [text, setText] = useState(String(initial))
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const amount = parseAmount(text, 'nonNegative')
    if (!amount.ok) {
      setError(strings.errors[amount.error])
      return
    }
    setError(null)
    onSubmit(amount.value)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={strings.setTotalTitle(name)}
      footer={<Button onClick={submit}>{strings.save}</Button>}
    >
      <TextField
        label={strings.newTotal}
        inputMode="decimal"
        value={text}
        onChange={(value) => {
          setText(value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        suffix={baseUnit}
        error={error ?? undefined}
      />
    </BottomSheet>
  )
}
