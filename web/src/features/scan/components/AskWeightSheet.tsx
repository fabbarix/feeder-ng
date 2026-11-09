import { useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { parseAmount } from '../../stock/lib/amount'
import { scanStrings } from '../strings'

export interface AskWeightSheetProps {
  open: boolean
  onClose: () => void
  productName: string
  /** the price on the label, formatted ("$2.50") */
  priceText: string
  /** grams, > 0 */
  onSubmit: (grams: number) => void
}

/** "How much does it weigh?": asked once for a price-valued code, so the price per kg can be worked out. */
export function AskWeightSheet({ open, onClose, productName, priceText, onSubmit }: AskWeightSheetProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState(false)

  const submit = () => {
    const parsed = parseAmount(text, 'positive')
    if (!parsed.ok) {
      setError(true)
      return
    }
    setError(false)
    onSubmit(parsed.value)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={scanStrings.askWeightTitle}>
      <p>{`${productName} has a label price of ${priceText}, so the weight is needed to work out the price per kg.`}</p>
      <p className="field__hint">{scanStrings.weightHint}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="ask-weight-field">
            {scanStrings.weight}
          </label>
          <input id="ask-weight-field" className="field__input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {error ? <p className="field__error" role="alert">{scanStrings.mustBePositive}</p> : null}
        <Button type="submit">{scanStrings.save}</Button>
      </form>
    </BottomSheet>
  )
}
