// B9-47 (RES-09): the data of the tiles that read their own queries. Each tile's cell calls its hook INSIDE its TileErrorBoundary,
// so a tile whose data cannot be shown fails alone, and Try again (which resets the tile's query keys) reads it afresh.
import { useMemo } from 'react'
import { useTimers, type TimerItem } from '../../cook/hooks/useTimers'
import { useLeftovers } from '../../plan'
import { useStockTotals } from '../../stock/hooks/useStock'
import { boardHero, type BoardHero } from '../lib/hero'
import { leftoverRows, tomorrowSlots, tonightNotServed, useSoonRows, type LeftoverRow } from '../lib/tiles'
import type { SlotLike, StockTotalLike } from '../types'

/** The board lists at most this many Leftovers and Use soon Ingredients. */
const BOARD_LIST_MAX = 5

/** The query keys each tile's Try again resets: only its own, never the board's (which would blank every tile). */
export const BOARD_TILE_KEYS = {
  leftovers: [['plan', 'leftovers']],
  useSoon: [['stock', 'totals']],
  timers: [['cook', 'timers']],
} as const

export function useBoardLeftovers(): LeftoverRow[] {
  const { leftovers } = useLeftovers()
  return leftoverRows(leftovers, BOARD_LIST_MAX)
}

export function useBoardUseSoon(): StockTotalLike[] {
  const totals = useStockTotals()
  return useSoonRows(totals.data ?? [], BOARD_LIST_MAX)
}

export function useBoardTimers(): TimerItem[] {
  return useTimers().items
}

/** The hero at `now` (Today's selection) and, for no hero, the slots Not served today. */
export function useBoardHero(slots: SlotLike[], now: Date, today: string): { hero: BoardHero | null; notServed: SlotLike[] } {
  return useMemo(() => ({ hero: boardHero(slots, now, today), notServed: tonightNotServed(slots, today) }), [slots, now, today])
}

export function useBoardTomorrow(slots: SlotLike[], today: string): SlotLike[] {
  return useMemo(() => tomorrowSlots(slots, today), [slots, today])
}
