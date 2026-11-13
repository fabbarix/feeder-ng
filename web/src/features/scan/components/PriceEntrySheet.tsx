// SR4: the Price entry of one row (shop-scan-proposals.md 13.4): a non-modal half-height BottomSheet around the compact
// PriceKeypad, so the Scanned list stays in view above it (the row being priced is outlined). Keyed by the entry, so the next
// row starts afresh. It reports Save, Next and Close with what was typed; the screen saves it. Replaces PriceEditSheet.
import { useRef } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { PriceKeypad, type PriceEntry, type PriceKeypadHandle } from '../../../ui/PriceKeypad'
import type { PackSize } from '../../../ui/lib/priceImplication'
import type { ScannedRow } from '../lib/scannedList'
import { scanStrings } from '../strings'

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

const NOTHING_TYPED: PriceEntry = { basis: 'pack', cents: null, packCents: null, perKgCents: null }

export function PriceEntrySheet({ row, shopName, currency, locale, pack, last, weighed, initialPerKgCents, hasNext, error, onNext, onSave, onClose, entryKey }: PriceEntrySheetProps) {
  const keypad = useRef<PriceKeypadHandle>(null)
  // The header X closes like Escape and the keypad's Close: through the keypad, which keeps a valid typed Price.
  const close = () => (keypad.current ? keypad.current.close() : onClose(NOTHING_TYPED))
  return (
    <BottomSheet open modal={false} size="half" title={scanStrings.priceOf(row.name)} onClose={close}>
      <PriceKeypad
        ref={keypad}
        key={entryKey ?? row.key}
        compact
        showName={false}
        productName={row.name}
        currency={currency}
        locale={locale}
        pack={pack}
        last={last}
        weighed={weighed}
        initialCents={row.weighed ? null : row.priceCents}
        initialPerKgCents={initialPerKgCents}
        shopName={shopName}
        hasNext={hasNext}
        onNext={onNext}
        onSave={onSave}
        onClose={onClose}
      />
      {error ? (
        <p role="alert" className="price-entry__error">
          {error}
        </p>
      ) : null}
    </BottomSheet>
  )
}
