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

/**
 * The Stock-take sheet (functional spec §10.2) titled "Stock-take: <productName>": "In Stock now: <text>", three
 * actions "+1 pack", "−1 pack" and "Set total". "Set total" reveals a field "New total" (Base Units) and "Save";
 * a negative or unparsable total shows "The amount cannot be negative" / "Enter an amount" (stock/lib/amount
 * parseAmount rules) and does not call onAction. +1 / −1 call onAction at once. Stub until implemented.
 */
export function StockTakeSheet(props: StockTakeSheetProps) {
  void props
  return null
}
