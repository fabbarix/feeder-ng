import type { TodayData, TodayLayout } from '../types'

/**
 * Decides what Today shows. While a scan session is active it is the Shopping List.
 * Otherwise tiles with something to show, in this order and size: next Planned Meal
 * (lg, accent), spoiled "Throw out or keep?" (full, spoil), Advance Steps (wide),
 * To confirm (md), couldn't-plan notice (wide), Leftovers (md, leftover), use-soon
 * (md, spoil), zero-waste streak (sm, only when > 0 days). `empty` is true when no
 * tile other than the streak would show. Not implemented yet.
 */
export function composeToday(_data: TodayData): TodayLayout {
  throw new Error('composeToday: not implemented')
}
