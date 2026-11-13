// DS-SHOP: the metric strip and the notice of one list, derived once per list and Shop (the lib functions do the maths).
import { useMemo } from 'react'
import { unconfirmedNotice, type UnconfirmedNotice } from '../lib/notice'
import { shopSummary, type ShopSummary } from '../lib/summary'
import type { ShoppingList } from '../types'

export interface ShopSummaryView {
  summary: ShopSummary
  notice: UnconfirmedNotice | null
}

export function useShopSummary(list: ShoppingList, shopName: string | null): ShopSummaryView {
  return useMemo(() => ({ summary: shopSummary(list, shopName), notice: unconfirmedNotice(list) }), [list, shopName])
}
