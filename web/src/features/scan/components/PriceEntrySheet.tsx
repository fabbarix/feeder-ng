// SR4: the Price entry of one row (shop-scan-proposals.md 13.4): a BottomSheet around the PriceKeypad, keyed by the row so
// the next row starts empty. It reports Save, Next and Close with what was typed; the screen saves it. Replaces PriceEditSheet.
import { BottomSheet } from '../../../ui/BottomSheet'
import { PriceKeypad, type PriceEntry } from '../../../ui/PriceKeypad'
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
  /** a weighed row's weight in g or ml: it opens on per kg */
  weighed?: number
  initialPerKgCents?: number | null
  /** another row has no Price: the primary is "Next without a Price" */
  hasNext: boolean
  /** a refusal or a failed save, shown under the keypad; the sheet stays open */
  error: string | null
  onNext: (entry: PriceEntry) => void
  onSave: (entry: PriceEntry) => void
  onClose: (entry: PriceEntry) => void
}

const NOTHING_TYPED: PriceEntry = { basis: 'pack', cents: null, packCents: null, perKgCents: null }

export function PriceEntrySheet({ row, shopName, currency, locale, pack, last, weighed, initialPerKgCents, hasNext, error, onNext, onSave, onClose }: PriceEntrySheetProps) {
  return (
    <BottomSheet open title={scanStrings.priceOf(row.name)} onClose={() => onClose(NOTHING_TYPED)}>
      <PriceKeypad
        key={row.key}
        productName={row.name}
        currency={currency}
        locale={locale}
        pack={pack}
        last={last}
        weighed={weighed}
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
