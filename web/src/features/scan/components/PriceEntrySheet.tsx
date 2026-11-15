// SR4: the Price entry of one row (shop-scan-proposals.md 13.4): a non-modal half-height sheet around the compact keypad, so the
// Scanned list stays in view above it (the row being priced is outlined). Keyed by the entry, so the next row starts afresh. It reports
// Save, Next and Close with what was typed; the screen saves it. B9-43 (SSP-13): a thin wrapper of the shared ui/PriceSheet (the Shop's
// "Change the Price" uses the same sheet). SSP-12 (R-B): the keypad's own footer Close is the only Close.
import { PriceSheet, type PackSize, type PriceEntry } from '../../../ui/PriceSheet'
import type { ScannedRow } from '../lib/scannedList'

export interface PriceEntrySheetProps {
  row: ScannedRow
  shopName: string
  currency: string
  locale?: string
  /** the Product's pack: "per pack · per kg" for grams and millilitres */
  pack?: PackSize
  last: { cents: number; date: string } | null
  /** a weighed row's weight in g or ml: it opens on per kg (on its `initialPerKgCents`); a pack row opens on its own Price */
  weighed?: number
  initialPerKgCents?: number | null
  /** another row has no Price: the primary is "Next without a Price" */
  hasNext: boolean
  /** a refusal or a failed save, shown under the keypad; the sheet stays open */
  error: string | null
  onNext: (entry: PriceEntry) => void
  onSave: (entry: PriceEntry) => void
  onClose: (entry: PriceEntry) => void
  /** what keys the keypad (default the row's key): stable while a new Product's row re-keys to its Product id */
  entryKey?: string
}

export function PriceEntrySheet({ row, entryKey, ...rest }: PriceEntrySheetProps) {
  return (
    <PriceSheet
      {...rest}
      modal={false}
      productName={row.name}
      initialCents={row.weighed ? null : row.priceCents}
      entryKey={entryKey ?? row.key}
    />
  )
}
