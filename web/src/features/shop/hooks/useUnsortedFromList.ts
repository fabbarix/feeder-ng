// B9-43 (SSP-09): the count behind "Put away 17 Stock Lots": this list's Stock Lots that are still Not sorted.
import { useEffect, useState } from 'react'
import { stockApi } from '../../stock/api'
import type { StockLot } from '../../stock/types'
import { unsortedFromList } from '../lib/unsorted'
import type { ShoppingList } from '../types'

/**
 * Reads the Stock Lots (stockApi.lots) only while `list.complete` (the complete tile is the one consumer) and gives lib/unsorted
 * unsortedFromList; 0 until they have loaded, and 0 on a failed read (the tile then offers no Put away; the Shop never breaks). A new tick
 * or Scan (more Stock Lots added) reads them again; coming back from the Pantry's Put away mounts the screen again, so it reads afresh.
 * A plain effect rather than react-query: Scan's To get shows the same tile, and Scan's screen does not depend on a QueryClient.
 */
export function useUnsortedFromList(list: ShoppingList | undefined): number {
  const [lots, setLots] = useState<StockLot[] | null>(null)
  const complete = list?.complete === true
  const day = list?.today
  const added = list?.summary.lotsAdded
  useEffect(() => {
    if (!complete) return
    let alive = true
    stockApi
      .lots()
      .then((r) => {
        if (alive) setLots(r.lots)
      })
      .catch(() => {
        if (alive) setLots(null)
      })
    return () => {
      alive = false
    }
  }, [complete, day, added])
  if (!list || !complete || lots === null) return 0
  return unsortedFromList(lots, list)
}
