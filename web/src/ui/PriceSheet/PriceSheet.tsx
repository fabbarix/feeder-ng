// B9-43 (SSP-13): the Price keypad in a sheet, lifted from features/scan/components/PriceEntrySheet.tsx so the Shop's Line sheet ("Change
// the Price") and Scan share one Price sheet around ui/PriceKeypad. It reports Save, Next and Close with what was typed; the caller saves.
// R-B: ONE Close, the keypad's footer Close (outlined secondary); the sheet header has none. Escape closes like that Close, through the
// keypad, so a valid typed Price is kept. Modal by default (auto height); `modal={false}` is Scan's non-modal half sheet.
import { useRef } from 'react'
import { BottomSheet } from '../BottomSheet'
import { PriceKeypad, type PriceEntry, type PriceKeypadHandle } from '../PriceKeypad'
import type { PackSize } from '../lib/priceImplication'
import { uiStrings } from '../strings'
import './PriceSheet.css'

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

const NOTHING_TYPED: PriceEntry = { basis: 'pack', cents: null, packCents: null, perKgCents: null }

export function PriceSheet({
  productName,
  shopName,
  currency,
  locale,
  pack,
  last,
  weighed,
  initialCents,
  initialPerKgCents,
  hasNext = false,
  error,
  onNext,
  onSave,
  onClose,
  modal = true,
  entryKey,
}: PriceSheetProps) {
  const keypad = useRef<PriceKeypadHandle>(null)
  // Escape closes like the keypad's Close: through the keypad, which keeps a valid typed Price.
  const close = () => (keypad.current ? keypad.current.close() : onClose(NOTHING_TYPED))
  return (
    <BottomSheet open modal={modal} size={modal ? 'auto' : 'half'} title={uiStrings.priceOf(productName)} onClose={close} closeButton={false}>
      {/* the modal sheet names the Shop the Price is for (Scan's half sheet sits under the Shop's own Scan session, so it does not) */}
      {modal ? <p className="price-sheet__shop">{uiStrings.priceAt(shopName)}</p> : null}
      <PriceKeypad
        ref={keypad}
        key={entryKey ?? productName}
        compact
        showName={false}
        productName={productName}
        currency={currency}
        locale={locale}
        pack={pack}
        last={last}
        weighed={weighed}
        initialCents={initialCents}
        initialPerKgCents={initialPerKgCents}
        shopName={shopName}
        hasNext={hasNext}
        onNext={onNext ?? onSave}
        onSave={onSave}
        onClose={onClose}
      />
      {error ? (
        <p role="alert" className="price-sheet__error">
          {error}
        </p>
      ) : null}
    </BottomSheet>
  )
}
