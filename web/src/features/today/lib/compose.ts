import type { TodayData, TodayLayout } from '../types'

/**
 * Decides what Today shows. While a scan session is active it is the Shopping List. Otherwise the tiles with
 * something to show, in the hierarchy of ui-fix-plan 5.1: nextMeal (the hero, first), toConfirm, advanceSteps,
 * leftovers, useSoon, streak (only from one day on), spoiled ("Throw out or keep?"), couldntPlan. `empty` is true
 * when no tile other than the streak would show.
 */
export function composeToday(_d: TodayData): TodayLayout {
  throw new Error('not implemented (WP6)')
}
