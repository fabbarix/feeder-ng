import { useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { parseAmount, type AmountError } from '../../stock/lib/amount'
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

const amountError: Record<AmountError, string> = {
  empty: scanStrings.enterAmount,
  invalid: scanStrings.enterAmount,
  negative: scanStrings.amountNegative,
  notPositive: scanStrings.enterAmount,
}

/** The Stock-take sheet: +1 pack, -1 pack, or set the total of the Ingredient's Stock. */
export function StockTakeSheet({ open, onClose, productName, ingredientName, currentStockText, packText, onAction }: StockTakeSheetProps) {
  const [settingTotal, setSettingTotal] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const saveTotal = () => {
    const parsed = parseAmount(text, 'nonNegative')
    if (!parsed.ok) {
      setError(amountError[parsed.error])
      return
    }
    setError(null)
    onAction('set_total', parsed.value)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={scanStrings.stockTakeTitle(productName)}>
      <p>{scanStrings.currentStock(currentStockText)}</p>
      <p className="field__hint">{`${ingredientName} · ${packText}`}</p>
      <div className="stock-take__actions">
        <Button variant="tonal" onClick={() => onAction('plus_pack')}>
          {scanStrings.plusPack}
        </Button>
        <Button variant="tonal" onClick={() => onAction('minus_pack')}>
          {scanStrings.minusPack}
        </Button>
        <Button variant="ghost" onClick={() => setSettingTotal(true)}>
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
          <div className="field">
            <label className="field__label" htmlFor="stock-take-total">
              {scanStrings.newTotal}
            </label>
            <input id="stock-take-total" className="field__input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {error ? <p className="field__error" role="alert">{error}</p> : null}
          <Button type="submit">{scanStrings.save}</Button>
        </form>
      ) : null}
    </BottomSheet>
  )
}
