import type { PlanSlot } from '../types'

/** How many Planned Meals Regenerate would change: state planned, not Pinned, dated today or later. */
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
  const body =
    unpinned === 0
      ? 'No Planned Meals will change. Empty Meal Slots may be filled.'
      : `${unpinned} unpinned Planned ${unpinned === 1 ? 'Meal' : 'Meals'} will change. Pinned and Cooked ones stay as they are.`
  return { title: 'Regenerate the plan?', body, confirmLabel: 'Regenerate' }
}
