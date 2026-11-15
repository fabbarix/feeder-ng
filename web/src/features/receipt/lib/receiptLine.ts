// B9-50 (SSP-08) stub: the "On the receipt" block of the Add… sheet, from the proposal of a Not scanned line. The developer builds it.
import type { ReceiptLineInfo } from '../../scan/components/NewProductSheet'
import type { Proposal } from '../types'
import type { Money } from './reviewCopy'

export function receiptLineFor(proposal: Proposal, money: Money): ReceiptLineInfo {
  void money
  return { text: proposal.text, detail: '', scans: 0 }
}
