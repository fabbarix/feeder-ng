// CRS F: Next held by the next item's own Course (spec 11). STUB.
import type { VisibleItem } from '../lib/timeline'
import type { UseStepGate } from './useStepGate'
import type { TimerItem } from './useTimers'

/**
 * Like useStepGate, for the timeline: the item after `index` in `items` (the current filter's list) is held by
 * lib/timeline holdingTimersFor(next, timerItems, mainCourseId) only. The text is the same as useStepGate's: one timer
 * "Next waits for <label>: <m:ss> left. Cancel its timer to go on now.", several "Next waits for N timers: ...".
 */
export function useItemGate(_items: VisibleItem[], _index: number, _timerItems: TimerItem[], _mainCourseId: number | null, _next: () => void): UseStepGate {
  throw new Error('CRS F: not implemented')
}
