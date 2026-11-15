// B9-50 (SSP-08): the receipt context of a Not scanned line's Add… sheet: the line as printed and priced ("On the receipt") and its name
// matches among the Household's Products and open Lines. Pure TypeScript, no React.
import type { ReceiptLineInfo, ReceiptMatch } from '../../scan/components/NewProductSheet'
import type { Proposal } from '../types'
import { receiptLineFor } from './receiptLine'
import { receiptMatches, type MatchSources } from './receiptMatches'
import type { Money } from './reviewCopy'

export function addSheetContext(proposal: Proposal, sources: MatchSources, money: Money): { receiptLine: ReceiptLineInfo; matches: ReceiptMatch[] } {
  const name = proposal.after.name?.trim() ? proposal.after.name : proposal.text
  return { receiptLine: receiptLineFor(proposal, money), matches: receiptMatches(name, sources) }
}
