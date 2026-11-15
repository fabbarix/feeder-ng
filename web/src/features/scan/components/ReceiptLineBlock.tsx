// B9-50 (SSP-08): "On the receipt" on top of a receipt line's Add…: the line as printed, its price and "×1 at $3.49", as one DetailList row.
// The row is the sheet's description (its id goes on the dialog). Render only.
import { useId } from 'react'
import { DetailList, DetailRow } from '../../../ui'
import '../../../ui/fields/Field.css' // the shared .visually-hidden utility
import { newProductStrings } from '../newProductStrings'
import type { ReceiptLineInfo } from './NewProductSheet'

const t = newProductStrings.receipt

export function ReceiptLineBlock({ line, id }: { line: ReceiptLineInfo; id?: string }) {
  const titleId = useId()
  const listId = useId()
  return (
    <section className="receipt-context" aria-labelledby={titleId}>
      <p id={titleId} className="receipt-context__over">
        {t.onReceipt}
      </p>
      <span id={listId} className="visually-hidden">
        {t.lineList}
      </span>
      <div id={id}>
        <DetailList aria-labelledby={listId}>
          <DetailRow label={line.text} state={line.priceText} detail={line.detail} />
        </DetailList>
      </div>
    </section>
  )
}
