import type { TileId, TodayData, TodayLayout } from '../types'

/**
 * Decides what Today shows. While a scan session is active it is the Shopping List. Otherwise the tiles with
 * something to show, in the hierarchy of ui-fix-plan 5.1: nextMeal (the hero, first), toConfirm, advanceSteps,
 * leftovers, useSoon, streak (only from one day on), spoiled ("Throw out or keep?"), couldntPlan. `empty` is true
 * when no tile other than the streak would show.
 */
export function composeToday(d: TodayData): TodayLayout {
  if (d.scanSessionActive) return { mode: 'shopping' }
  const ids: TileId[] = []
  if (d.hasNextMeal) ids.push('nextMeal')
  if (d.toConfirm > 0) ids.push('toConfirm')
  if (d.advanceSteps > 0) ids.push('advanceSteps')
  if (d.leftovers > 0) ids.push('leftovers')
  if (d.useSoon > 0) ids.push('useSoon')
  if (d.streakDays >= 1) ids.push('streak')
  if (d.spoiled > 0) ids.push('spoiled')
  if (d.couldntPlan > 0) ids.push('couldntPlan')
  return {
    mode: 'today',
    tiles: ids.map((id) => ({ id })),
    empty: ids.every((id) => id === 'streak'),
  }
}
