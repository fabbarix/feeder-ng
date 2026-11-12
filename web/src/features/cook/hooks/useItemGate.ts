// CRS F: Next held by the next item's own Course (spec 11). Like useStepGate, for the timeline.
import { formatTimer } from '../../../lib/format'
import { holdingTimersFor, type VisibleItem } from '../lib/timeline'
import { cookStrings } from '../strings'
import type { UseStepGate } from './useStepGate'
import type { TimerItem } from './useTimers'

/**
 * Like useStepGate, for the timeline: the item after `index` in `items` (the current filter's list) is held by
 * lib/timeline holdingTimersFor(next, timerItems, mainCourseId) only. The text is the same as useStepGate's: one timer
 * "Next waits for <label>: <m:ss> left. Cancel its timer to go on now.", several "Next waits for N timers: ...".
 */
export function useItemGate(items: VisibleItem[], index: number, timerItems: TimerItem[], mainCourseId: number | null, next: () => void): UseStepGate {
  const holding = holdingTimersFor(items[index + 1]?.item ?? null, timerItems, mainCourseId)
  if (holding.length === 0) return { canNext: true, heldText: null, next }
  const longest = Math.max(...holding.map((i) => i.seconds))
  const heldText =
    holding.length === 1 ? cookStrings.nextHeld(holding[0]!.timer.label, formatTimer(longest)) : cookStrings.nextHeldMany(holding.length, formatTimer(longest))
  return { canNext: false, heldText, next: () => {} }
}
