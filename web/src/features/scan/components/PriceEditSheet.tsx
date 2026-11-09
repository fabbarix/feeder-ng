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
 * A BottomSheet titled "Price of <productName>" with a field labelled "Price" prefilled with the current price as
 * plain decimals (products/lib/money formatMajor) and a "Save price" button. Parses with parseMajor; an empty, zero
 * or unparsable entry shows "Enter a number above 0" and does not save. Stub until implemented.
 */
export function PriceEditSheet(props: PriceEditSheetProps) {
  void props
  return null
}
