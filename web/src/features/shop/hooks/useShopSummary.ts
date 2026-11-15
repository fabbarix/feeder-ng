// DS-SHOP: the metric strip and the notice of one list, derived once per list and Shop (the lib functions do the maths).
import { useMemo } from 'react'
import { unconfirmedNotice, type UnconfirmedNotice } from '../lib/notice'
import { shopSummary, type ShopSummary } from '../lib/summary'
import type { ShoppingList } from '../types'

export interface ShopSummaryView {
  summary: ShopSummary
  notice: UnconfirmedNotice | null
}

/** B9-54: `waiting` = Ticks still in the offline queue ("· 1 waiting"); 0 or omitted when none. */
export function useShopSummary(list: ShoppingList, shopName: string | null, waiting = 0): ShopSummaryView {
  return useMemo(() => ({ summary: shopSummary(list, shopName, { waiting }), notice: unconfirmedNotice(list) }), [list, shopName, waiting])
}
