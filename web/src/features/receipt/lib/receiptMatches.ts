// B9-50 (SSP-08) stub: the name matches of a receipt line (the Products first, then the open Lines; at most 3). The developer builds it.
import type { LineCandidate } from '../../scan/lib/lineChoice'
import type { ReceiptMatch } from '../../scan/components/NewProductSheet'
import type { OfflineProduct } from '../../scan/types'

export interface MatchSources {
  products: Pick<OfflineProduct, 'id' | 'name' | 'ingredientId' | 'baseUnit' | 'packSize'>[]
  lines: LineCandidate[]
}

export function receiptMatches(name: string, sources: MatchSources, limit = 3): ReceiptMatch[] {
  void name
  void sources
  void limit
  return []
}
