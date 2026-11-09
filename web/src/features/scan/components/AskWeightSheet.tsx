export interface AskWeightSheetProps {
  open: boolean
  onClose: () => void
  productName: string
  /** the price on the label, formatted ("$2.50") */
  priceText: string
  /** grams, > 0 */
  onSubmit: (grams: number) => void
}

/**
 * A BottomSheet titled "How much does it weigh?" for a price-valued Weight Barcode Rule with no price per kg
 * (functional spec §5, §15 item 3): it names the Product and the label price, has a field "Weight (g)" and a
 * "Save" button; an empty, zero or unparsable weight shows "Enter a number above 0" and does not submit. The hint
 * "Weigh it once; the price per kg is remembered for next time." is shown. Stub until implemented.
 */
export function AskWeightSheet(props: AskWeightSheetProps) {
  void props
  return null
}
