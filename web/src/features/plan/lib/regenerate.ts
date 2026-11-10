import type { PlanSlot } from '../types'

/** How many Planned Meals Regenerate would change: state planned, not Pinned, dated today or later. */
export function regenerateImpact(_slots: PlanSlot[], _today: string): number {
  throw new Error('not implemented (WP6)')
}

export interface RegenerateConfirmCopy {
  title: string
  body: string
  confirmLabel: string
}

/** Copy of the Regenerate confirm dialog; the body states the count (plan 2.4). */
export function regenerateConfirmCopy(_unpinned: number): RegenerateConfirmCopy {
  throw new Error('not implemented (WP6)')
}
