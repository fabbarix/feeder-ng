// DS-SHOP (docs/design/system.md §2): the metric strip's numbers and words, derived once per list. Plain TypeScript, no React.
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'
import type { ShoppingList } from '../types'
import { weekdayOf } from './rows'

export interface ShopSummary {
  /** what is still to get: the server's total minus the ticked ones (Not needed Lines are not in it) */
  left: number
  ticked: number
  total: number
  /** the share ticked, 0 to 100 (the progress fill) */
  percent: number
  /** "of 18 left" */
  leftOf: string
  /** "2 ticked · until Sun 15": what has been ticked and how far the range reaches */
  meta: string
  /** the estimated total and what it is priced at; null when nothing is priced (no "$0.00", no dash) */
  estimated: { text: string; caption: string } | null
  /** how many Lines have no Price yet; null when all have one */
  unpriced: { count: number; text: string } | null
}

/** The day after a YYYY-MM-DD date. */
function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10)
}

/** "today", "until tomorrow", or "until Sun 15" for the range's last day. */
function untilText(today: string, to: string): string {
  if (to <= today) return shopStrings.untilToday
  if (to === nextDay(today)) return shopStrings.untilTomorrow
  return shopStrings.untilDay(`${weekdayOf(to)} ${Number(to.slice(8))}`)
}

export function shopSummary(list: ShoppingList, shopName: string | null): ShopSummary {
  const { ticked, total } = list.progress
  return {
    left: total - ticked,
    ticked,
    total,
    percent: total > 0 ? Math.min(100, Math.max(0, (ticked / total) * 100)) : 0,
    leftOf: shopStrings.leftOf(total),
    meta: `${shopStrings.tickedCount(ticked)} · ${untilText(list.today, list.to)}`,
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
