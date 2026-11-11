// Holds Next while the next Step waits for a Step whose timer still counts down (spec §11, recipe-file "after"). Used by
// the Next tile, the tablet tap zone and the "next" voice command alike. React hook over lib/steps.holdingTimers.
import { formatTimer } from '../../../lib/format'
import { holdingTimers } from '../lib/steps'
import { cookStrings } from '../strings'
import type { CookStep } from '../types'
import type { TimerItem } from './useTimers'

export interface UseStepGate {
  /** false while a timer holds the next Step */
  canNext: boolean
  /** why Next is held ("Next waits for Step 1 · Pre-heat the oven: 4:12 left. …"); null when it is not */
  heldText: string | null
  /** session.next, or nothing while held */
  next: () => void
}

/** `steps` and `index` are the session's; `items` come from useTimers (they tick every second). */
export function useStepGate(steps: CookStep[], index: number, items: TimerItem[], scope: string, next: () => void): UseStepGate {
  const holding = holdingTimers(steps[index + 1] ?? null, items, scope)
  if (holding.length === 0) return { canNext: true, heldText: null, next }
  const longest = Math.max(...holding.map((i) => i.seconds))
  const heldText = holding.length === 1 ? cookStrings.nextHeld(holding[0]!.timer.label, formatTimer(longest)) : cookStrings.nextHeldMany(holding.length, formatTimer(longest))
  return { canNext: false, heldText, next: () => {} }
}
