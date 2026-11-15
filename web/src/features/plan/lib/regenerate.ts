import { planStrings as s } from '../strings'
import { undoStrings as u } from '../strings/undo'
import type { PlanSlot } from '../types'
import type { RegenerateDryRun } from './bought'
import { weekdayName } from './phrase'

/** How many meals Regenerate would change: each Course's Planned Meal that is state planned, not Pinned, dated today or later. */
export function regenerateImpact(slots: PlanSlot[], today: string): number {
  return slots
    .filter((s) => s.date >= today)
    .reduce((n, s) => n + (s.courses ?? []).filter((c) => c.meal !== null && c.meal.state === 'planned' && !c.meal.pinned).length, 0)
}

export interface RegenerateConfirmCopy {
  title: string
  /** The lead: the count (one paragraph). */
  body: string
  /** B9-26 (SAFE-07): "Pinned and Cooked ones stay. You can undo it straight after." (ConfirmOptions.note). */
  note?: string
  /** B9-26 (SAFE-07): the Bought Planned Meals behind a one-line summary, as rows (ConfirmOptions.details). Absent when none is Bought. */
  details?: { summary: string; rows: { key: string; state?: string; detail?: string }[] }
  confirmLabel: string
}

/**
 * Copy of the Regenerate question (plan 2.4, SAFE-07): the lead states the count, the note says what stays and that it can be undone,
 * and the Bought Planned Meals it would replace are R-E rows behind a one-line summary ("Wed Lunch" · "Carrot bought" · the Recipe).
 */
export function regenerateConfirmCopy(unpinned: number, dryRun?: RegenerateDryRun | null): RegenerateConfirmCopy {
  const body = unpinned === 0 ? s.regenerateNone : s.regenerateCount(unpinned)
  const copy: RegenerateConfirmCopy = { title: s.regenerateConfirmTitle, body, note: s.regenerateNote, confirmLabel: s.regenerateConfirmLabel }
  const bought = dryRun?.bought ?? []
  if (bought.length > 0) {
    copy.details = {
      summary: u.regenerateBoughtSummary(bought.length),
      rows: bought.map((b) => ({ key: u.slotLabel(weekdayName(b.date, 'short'), b.mealSlotName), state: u.regenerateBoughtState(b.ingredients.join(', ')), detail: b.recipeName })),
    }
  }
  return copy
}
