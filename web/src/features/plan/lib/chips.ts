import type { ChipStatus } from '../../../ui'
import type { PlannedMeal } from '../types'
import type { PhraseContext } from './phrase'

/** One chip of a Planned Meal: what the planner or the state says, never a raw fact (ui-fix-plan 4.3). */
export interface PlanChip {
  /** Stable React key and dedupe key. */
  key: string
  kind: 'why' | 'state' | 'status'
  /** Needed by 'state' and 'status'. */
  status?: ChipStatus
  label: string
}

/**
 * The single chip a day tile shows (rule: at most 1). Priority: Cooked (state success), Not cooked (state danger),
 * Pinned (state pinned), served from a Leftover (status leftover "Leftover from Tue"), then the first phrased why
 * chip. 'best_available' never makes a chip. null when there is nothing to say.
 */
export function dayChip(_meal: PlannedMeal, _ctx: PhraseContext): PlanChip | null {
  throw new Error('not implemented (WP6)')
}

/**
 * The chips of the Planned Meal sheet (rule: at most 3, overflow becomes a count chip "+N"): states first (Cooked,
 * Not cooked, Pinned), then the Leftover chip, then the why chips. No duplicates by label; a 'leftover' why is
 * dropped when the meal is served from a Leftover (the status chip already says it).
 */
export function sheetChips(_meal: PlannedMeal, _ctx: PhraseContext): { chips: PlanChip[]; overflow: number } {
  throw new Error('not implemented (WP6)')
}

/** The why chips of the Today hero (rule: at most 2), most relevant first; states are not repeated there. */
export function heroChips(_meal: PlannedMeal, _ctx: PhraseContext): PlanChip[] {
  throw new Error('not implemented (WP6)')
}
