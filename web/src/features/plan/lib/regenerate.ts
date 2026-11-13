import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'
import { regenerateBoughtLines, type RegenerateDryRun } from './bought'

/** How many meals Regenerate would change: each Course's Planned Meal that is state planned, not Pinned, dated today or later. */
export function regenerateImpact(slots: PlanSlot[], today: string): number {
  return slots
    .filter((s) => s.date >= today)
    .reduce((n, s) => n + (s.courses ?? []).filter((c) => c.meal !== null && c.meal.state === 'planned' && !c.meal.pinned).length, 0)
}

export interface RegenerateConfirmCopy {
  title: string
  body: string
  confirmLabel: string
}

/** Copy of the Regenerate confirm dialog; the body states the count (plan 2.4). */
export function regenerateConfirmCopy(unpinned: number, dryRun?: RegenerateDryRun | null): RegenerateConfirmCopy {
  const count = unpinned === 0 ? s.regenerateNone : s.regenerateCount(unpinned)
  const { intro, lines } = regenerateBoughtLines(dryRun?.bought)
  const body = intro === null ? count : [count, intro, ...lines].join('\n')
  return { title: s.regenerateConfirmTitle, body, confirmLabel: s.regenerateConfirmLabel }
}
