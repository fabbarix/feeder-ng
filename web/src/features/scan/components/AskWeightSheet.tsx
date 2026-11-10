import { useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { NumberField } from '../../../ui/fields/NumberField'
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
  const [grams, setGrams] = useState<number | null>(null)
  const [error, setError] = useState(false)

  const submit = () => {
    if (grams === null || grams <= 0) {
      setError(true)
      return
    }
    setError(false)
    onSubmit(grams)
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
        <NumberField label={scanStrings.weight} value={grams} onChange={setGrams} min={0} error={error ? scanStrings.mustBePositive : undefined} />
        <Button type="submit">{scanStrings.save}</Button>
      </form>
    </BottomSheet>
  )
}
