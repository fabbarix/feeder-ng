import { useState } from 'react'
import { formatMajor, parseMajor } from '../../products/lib/money'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { scanStrings } from '../strings'

export interface PriceEditSheetProps {
  open: boolean
  onClose: () => void
  productName: string
  /** minor units, prefilled */
  priceCents: number | null
  currency: string
  /** called with the new price in minor units (> 0) */
  onSave: (priceCents: number) => void
}

/** "Price of <product>": edits the Price a scan recorded. */
export function PriceEditSheet({ open, onClose, productName, priceCents, currency, onSave }: PriceEditSheetProps) {
  const [text, setText] = useState(priceCents === null ? '' : formatMajor(priceCents, currency))
  const [error, setError] = useState(false)

  const submit = () => {
    const cents = parseMajor(text, currency)
    if (cents === null || cents <= 0) {
      setError(true)
      return
    }
    setError(false)
    onSave(cents)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Price of ${productName}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="price-edit-field">
            {scanStrings.priceLabel}
          </label>
          <input id="price-edit-field" className="field__input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {error ? <p className="field__error" role="alert">{scanStrings.mustBePositive}</p> : null}
        <Button type="submit">{scanStrings.savePrice}</Button>
      </form>
    </BottomSheet>
  )
}
