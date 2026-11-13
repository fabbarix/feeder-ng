import type { TileId, TodayData, TodayLayout } from '../types'

/**
 * Decides what Today shows. While a scan session is active it is the Shopping List. Otherwise the tiles with
 * something to show, in the hierarchy of ui-fix-plan 5.1 and docs/design/system.md §8: nextMeal (the hero, first),
 * toConfirm, metrics (the strip: streak, Leftovers, Lines to get, shown when any has a value), advanceSteps, leftovers,
 * useSoon, spoiled ("Throw out or keep?"), couldntPlan. While the Household is being set up (`needsSetup`) the setup
 * checklist comes first and replaces couldntPlan. `empty` is true when no tile other than the metric strip would show.
 */
export function composeToday(d: TodayData): TodayLayout {
  if (d.scanSessionActive) return { mode: 'shopping' }
  const ids: TileId[] = []
  if (d.needsSetup) ids.push('setup')
  if (d.hasNextMeal) ids.push('nextMeal')
  if (d.toConfirm > 0) ids.push('toConfirm')
  if (d.streakDays >= 1 || d.leftovers > 0 || d.linesToGet > 0) ids.push('metrics')
  if (d.advanceSteps > 0) ids.push('advanceSteps')
  if (d.leftovers > 0) ids.push('leftovers')
  if (d.useSoon > 0) ids.push('useSoon')
  if (d.spoiled > 0) ids.push('spoiled')
  if (d.couldntPlan > 0 && !d.needsSetup) ids.push('couldntPlan')
  return {
    mode: 'today',
    tiles: ids.map((id) => ({ id })),
    empty: !d.loadFailed && ids.every((id) => id === 'metrics'),
    failed: d.loadFailed === true,
  }
}
