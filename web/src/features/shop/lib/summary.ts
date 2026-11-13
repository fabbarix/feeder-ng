// DS-SHOP (docs/design/system.md §2): the metric strip's numbers, derived once per list. Plain TypeScript, no React.
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'
import type { ShoppingList } from '../types'

export interface ShopSummary {
  /** what is still to get: the server's total minus the ticked ones (Not needed Lines are not in it) */
  left: number
  ticked: number
  total: number
  /** the estimated total and what it is priced at; null when nothing is priced (no "$0.00", no dash) */
  estimated: { text: string; caption: string } | null
  /** how many Lines have no Price yet; null when all have one */
  unpriced: { count: number; text: string } | null
}

export function shopSummary(list: ShoppingList, shopName: string | null): ShopSummary {
  const { ticked, total } = list.progress
  return {
    left: total - ticked,
    ticked,
    total,
    estimated:
      list.estimatedCostCents > 0
        ? {
            text: formatMinor(list.estimatedCostCents, list.currency),
            caption: shopName ? shopStrings.estimatedAt(shopName) : shopStrings.estimatedAnyShop,
          }
        : null,
    unpriced: list.unpricedLines > 0 ? { count: list.unpricedLines, text: shopStrings.unpriced(list.unpricedLines) } : null,
  }
}
