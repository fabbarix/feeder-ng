import { useState } from 'react'
import { formatMajor, parseMajor } from '../../products/lib/money'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { TextField } from '../../../ui/fields/TextField'
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

/**
 * "Price of <product>": edits the Price a scan recorded. A TextField, not a NumberField: what is typed is checked as it
 * is (parseMajor: "1.59" or "1,59"), so a wrong entry is refused rather than replaced by the old Price.
 */
export function PriceEditSheet({ open, onClose, productName, priceCents, currency, onSave }: PriceEditSheetProps) {
  const [text, setText] = useState(() => (priceCents === null ? '' : formatMajor(priceCents, currency)))
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
        <TextField label={scanStrings.priceLabel} value={text} onChange={setText} inputMode="decimal" error={error ? scanStrings.mustBePositive : undefined} />
        <Button type="submit">{scanStrings.savePrice}</Button>
      </form>
    </BottomSheet>
  )
}
