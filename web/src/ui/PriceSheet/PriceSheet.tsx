// B9-43 (SSP-13): the Price keypad in a sheet, lifted from features/scan/components/PriceEntrySheet.tsx so the Shop's Line sheet and
// Scan share it. STUB (test author): the developer lifts the sheet (keeping Scan's behaviour) and generalises its props.
import type { PriceEntry } from '../PriceKeypad'
import type { PackSize } from '../lib/priceImplication'

export interface PriceSheetProps {
  /** the Product's name: the sheet is titled "Price of <name>" and the keypad is named by it */
  productName: string
  shopName: string
  currency: string
  locale?: string
  /** the pack: "per pack · per kg" for grams and millilitres */
  pack?: PackSize
  last: { cents: number; date: string } | null
  /** a weighed row's weight in g or ml: opens on per kg */
  weighed?: number
  initialCents?: number | null
  initialPerKgCents?: number | null
  /** another row has no Price: the primary is "Next without a Price" (Scan). Default false: the primary is "Save". */
  hasNext?: boolean
  /** a refusal or a failed save, shown under the keypad; the sheet stays open */
  error: string | null
  onNext?: (entry: PriceEntry) => void
  onSave: (entry: PriceEntry) => void
  onClose: (entry: PriceEntry) => void
  /** Scan's sheet is a non-modal half sheet (the list stays in view); the Line sheet's is modal. Default true (modal, auto height). */
  modal?: boolean
  /** what keys the keypad (default the product name) */
  entryKey?: string
}

export function PriceSheet(_props: PriceSheetProps) {
  return null
}
