import { useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { FormActions } from '../../../ui/FormActions'
import { NumberField } from '../../../ui/fields/NumberField'
import { scanStrings } from '../strings'
import type { StockTakeAction } from '../types'

export interface StockTakeSheetProps {
  open: boolean
  onClose: () => void
  productName: string
  ingredientName: string
  /** the formatted current Stock of the Ingredient ("1400 g", "nothing" is "0 g") */
  currentStockText: string
  /** the formatted pack size ("700 g") */
  packText: string
  /** total in Base Units for set_total */
  onAction: (action: StockTakeAction, total?: number) => void
}

/** The Stock-take sheet: +1 pack, -1 pack, or set the total of the Ingredient's Stock (a NumberField that never goes negative). */
export function StockTakeSheet({ open, onClose, productName, ingredientName, currentStockText, packText, onAction }: StockTakeSheetProps) {
  const [settingTotal, setSettingTotal] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saveTotal = () => {
    if (total === null) {
      setError(scanStrings.enterAmount)
      return
    }
    setError(null)
    onAction('set_total', total)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={scanStrings.stockTakeTitle(productName)}>
      <p>{scanStrings.currentStock(currentStockText)}</p>
      <p className="stock-take__pack">{`${ingredientName} · ${packText}`}</p>
      <div className="stock-take__actions">
        <Button variant="secondary" icon="add" onClick={() => onAction('plus_pack')}>
          {scanStrings.plusPack}
        </Button>
        <Button variant="secondary" icon="minus" onClick={() => onAction('minus_pack')}>
          {scanStrings.minusPack}
        </Button>
        <Button variant="tertiary" onClick={() => setSettingTotal(true)}>
          {scanStrings.setTotal}
        </Button>
      </div>
      {settingTotal ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveTotal()
          }}
        >
          <NumberField label={scanStrings.newTotal} value={total} onChange={setTotal} min={0} error={error ?? undefined} />
          <FormActions primary={<Button type="submit">{scanStrings.save}</Button>} />
        </form>
      ) : null}
    </BottomSheet>
  )
}
