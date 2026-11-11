import { useState } from 'react'
import { baseUnitLabel } from '../../../lib/units'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { FormActions } from '../../../ui/FormActions'
import { NumberField } from '../../../ui/fields/NumberField'
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

/** "How much?" before a tick by hand: a NumberField prefilled with the remaining quantity, then add to Stock or tick only. */
export function TickSheet({ open, onClose, name, baseUnit, defaultQuantity, onSubmit }: TickSheetProps) {
  const [value, setValue] = useState<number | null>(defaultQuantity)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (value === null) {
      setError(shopStrings.enterAmount)
      return
    }
    setError(null)
    onSubmit(value)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={shopStrings.tickTitle(name)}>
      <form
        className="shop-sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <NumberField label={shopStrings.howMuch} value={value} onChange={setValue} min={0} unit={baseUnitLabel(baseUnit, 'metric', value ?? undefined)} error={error ?? undefined} />
        <FormActions
          primary={<Button type="submit">{shopStrings.tickSave}</Button>}
          secondary={
            <Button variant="secondary" onClick={() => onSubmit(0)}>
              {shopStrings.tickOnly}
            </Button>
          }
        />
      </form>
    </BottomSheet>
  )
}
