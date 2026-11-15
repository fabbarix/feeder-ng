import type { TileId, TodayData, TodayLayout } from '../types'

/**
 * Decides what Today shows: the tiles with something to show, in DOM order (B9-44, TB-03): the Shopping tile while a Scan session is
 * active on this phone (TB-12), the setup checklist while the Household is being set up (it replaces Couldn't plan), the hero, To confirm,
 * then the aside's tiles (Advance Steps, the metric strip: the strip shows from a 1-day streak or a Line to get, TB 3), Couldn't plan,
 * Throw out or keep?, Leftovers and Use soon. `aside` names the aside's tiles that are present; CSS places them (and moves the strip
 * to the end below 60 rem). `empty` is true when no tile other than the metric strip would show.
 */
export function composeToday(d: TodayData): TodayLayout {
  const ids: TileId[] = []
  if (d.scanSessionActive) ids.push('shopping')
  if (d.needsSetup) ids.push('setup')
  if (d.hasNextMeal) ids.push('nextMeal')
  if (d.toConfirm > 0) ids.push('toConfirm')
  if (d.advanceSteps > 0) ids.push('advanceSteps')
  // DS-TODAY round 2: the Leftovers tile says its own count, so Leftovers alone does not open the strip.
  if (d.streakDays >= 1 || d.linesToGet > 0) ids.push('metrics')
  if (d.couldntPlan > 0 && !d.needsSetup) ids.push('couldntPlan')
  if (d.spoiled > 0) ids.push('spoiled')
  if (d.leftovers > 0) ids.push('leftovers')
  if (d.useSoon > 0) ids.push('useSoon')
  return {
    mode: 'today',
    tiles: ids.map((id) => ({ id })),
    aside: ids.filter((id) => id === 'advanceSteps' || id === 'metrics'),
    empty: !d.loadFailed && ids.every((id) => id === 'metrics'),
    failed: d.loadFailed === true,
  }
}
