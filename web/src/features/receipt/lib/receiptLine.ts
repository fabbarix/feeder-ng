// B9-50 (SSP-08): the "On the receipt" block of the Add… sheet, from the proposal of a Not scanned line: the line as printed, its price,
// and the detail "×{n} at {price}" (a weighed line: "{weight} at {price}"). Pure TypeScript, no React.
import { formatQuantity } from '../../../lib/units'
import type { ReceiptLineInfo } from '../../scan/components/NewProductSheet'
import type { Proposal } from '../types'
import type { Money } from './reviewCopy'

export function receiptLineFor(proposal: Proposal, money: Money): ReceiptLineInfo {
  const a = proposal.after
  const weighed = a.count === undefined && a.grams !== undefined && a.grams > 0
  const count = a.count !== undefined && a.count > 0 ? a.count : 1
  const amount = weighed ? formatQuantity(a.grams ?? 0, 'g', 'metric') : `×${count}`
  const out: ReceiptLineInfo = { text: proposal.text, detail: amount, scans: weighed ? 1 : count }
  if (a.priceCents !== undefined) {
    const price = money(a.priceCents)
    out.priceText = price
    out.detail = `${amount} at ${price}`
  }
  return out
}
