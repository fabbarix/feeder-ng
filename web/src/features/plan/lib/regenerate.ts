import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'

/** How many meals Regenerate would change: state planned, not Pinned, dated today or later. */
export function regenerateImpact(slots: PlanSlot[], today: string): number {
  return slots.filter((s) => s.meal !== null && s.meal.state === 'planned' && !s.meal.pinned && s.date >= today).length
}

export interface RegenerateConfirmCopy {
  title: string
  body: string
  confirmLabel: string
}

/** Copy of the Regenerate confirm dialog; the body states the count (plan 2.4). */
export function regenerateConfirmCopy(unpinned: number): RegenerateConfirmCopy {
  const body = unpinned === 0 ? s.regenerateNone : s.regenerateCount(unpinned)
  return { title: s.regenerateConfirmTitle, body, confirmLabel: s.regenerateConfirmLabel }
}
