import type { TodayData, TodayLayout, TileSpec } from '../types'

/**
 * Decides what Today shows. While a scan session is active it is the Shopping List.
 * Otherwise tiles with something to show, in this order and size: next Planned Meal
 * (lg, accent), spoiled "Throw out or keep?" (full, spoil), Advance Steps (wide),
 * To confirm (md), couldn't-plan notice (wide), Leftovers (md, leftover), use-soon
 * (md, spoil), zero-waste streak (sm, only from one day on). `empty` is true when no
 * tile other than the streak would show.
 */
export function composeToday(d: TodayData): TodayLayout {
  if (d.scanSessionActive) return { mode: 'shopping' }
  const tiles: TileSpec[] = []
  const add = (id: TileSpec['id'], show: boolean, size: TileSpec['size'], tone: TileSpec['tone']) => {
    if (show) tiles.push({ id, size, tone })
  }
  add('nextMeal', d.hasNextMeal, 'lg', 'accent')
  add('spoiled', d.spoiled > 0, 'full', 'spoil')
  add('advanceSteps', d.advanceSteps > 0, 'wide', 'neutral')
  add('toConfirm', d.toConfirm > 0, 'md', 'neutral')
  add('couldntPlan', d.couldntPlan > 0, 'wide', 'neutral')
  add('leftovers', d.leftovers > 0, 'md', 'leftover')
  add('useSoon', d.useSoon > 0, 'md', 'spoil')
  add('streak', d.streakDays > 0, 'sm', 'accent')
  return { mode: 'today', tiles, empty: tiles.every((t) => t.id === 'streak') }
}
