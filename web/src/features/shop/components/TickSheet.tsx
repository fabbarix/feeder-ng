import { useId, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { baseUnitLabel } from '../../../lib/units'
import { parseAmount } from '../../stock/lib/amount'
import { shopStrings } from '../strings'
import type { BaseUnit } from '../types'

export interface TickSheetProps {
  open: boolean
  onClose: () => void
  name: string
  baseUnit: BaseUnit
  /** the Line's remaining quantity in Base Units, prefilled (0 for free text) */
  defaultQuantity: number
  /** quantity in Base Units: 0 only ticks, > 0 adds a Stock Lot */
  onSubmit: (quantity: number) => void
}

/** "How much?" before a tick by hand: a field prefilled with the remaining quantity, then add to Stock or tick only. */
export function TickSheet({ open, onClose, name, baseUnit, defaultQuantity, onSubmit }: TickSheetProps) {
  const [text, setText] = useState(String(defaultQuantity))
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()

  const submit = () => {
    const parsed = parseAmount(text, 'nonNegative')
    if (!parsed.ok) {
      setError(parsed.error === 'negative' ? shopStrings.amountNegative : shopStrings.enterAmount)
      return
    }
    setError(null)
    onSubmit(parsed.value)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={shopStrings.tickTitle(name)}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={fieldId}>
            {shopStrings.howMuch}
          </label>
          <div className="field__row">
            <input id={fieldId} className="field__input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
            <span className="field__unit">{baseUnitLabel(baseUnit, 'metric')}</span>
          </div>
        </div>
        {error ? <p className="field__error" role="alert">{error}</p> : null}
        <Button type="submit">{shopStrings.tickSave}</Button>
        <Button variant="tonal" onClick={() => onSubmit(0)}>
          {shopStrings.tickOnly}
        </Button>
      </form>
    </BottomSheet>
  )
}
