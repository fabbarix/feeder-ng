// B9-26 (SAFE-03): how a Cooked or Not cooked meal was marked and whether it can still be undone: the sheet's words and the
// toasts' words. Plain TypeScript, no React. TEST-AUTHOR STUB: the signatures the tests pin; the developer replaces every body.
import type { CookedAllResult, CookedResult, PlanSlot, SlotKey } from '../types'

/** `meal.resolution` of GET /api/plan (B9-11): present on a Cooked or Not cooked meal. */
export interface MealResolution {
  kind: 'cooked' | 'not_cooked'
  /** Household date, YYYY-MM-DD. */
  markedOn?: string
  /** RFC 3339, UTC. */
  markedAt?: string
  markedBy?: string
  leftoverPortions: number
  canUndo: boolean
  /** 'window_over' in the read; the reopen error names it 'reopen_window_over' (both are mapped). */
  cannotUndo?: 'leftover_used' | 'window_over'
}

export interface UndoToastWords {
  headline: string
  subline?: string
  body?: string
  undoAriaLabel: string
  /** "Sat Breakfast is back in To confirm". */
  restored: string
}

const notBuilt = (): never => {
  throw new Error('B9-26: lib/resolved.ts is not built yet')
}

/** The sheet's summary: "Marked Cooked today at 08:40 by Anna. 1.25 portions were kept as a Leftover." */
export function resolvedSummary(_r: MealResolution, _ctx: { today: string; timeZone?: string }): string {
  return notBuilt()
}

/** The sheet's muted hint: why and until when it can be undone, or why it can no longer be. */
export function resolvedHint(_r: MealResolution, _ctx: { today: string }): string {
  return notBuilt()
}

/** The buttons of the sheet: Cooked: Undo Cooked; Not cooked: Cooked after all (primary) and Undo Not cooked. None when it cannot be undone. */
export function resolvedActions(_r: MealResolution): { id: 'undoCooked' | 'cookedAfterAll' | 'undoNotCooked'; label: string; primary: boolean }[] {
  return notBuilt()
}

/** How many Courses of the slot one Mark all marked (same kind, markedBy and markedAt as this Course); 1 for a single mark. */
export function markedTogether(_slot: PlanSlot, _courseId: number): number {
  return notBuilt()
}

/** The toast after one Course Cooked (CookedResult) or a Mark all Cooked (CookedAllResult, `courses` given). */
export function cookedToast(_src: { slots: PlanSlot[]; key: SlotKey; recipeName: string; result: CookedResult | CookedAllResult; courses?: number }): UndoToastWords {
  return notBuilt()
}

/** The toast after Not cooked, for one Course (`key.courseId`) or the whole slot (`whole`). */
export function notCookedToast(_src: { slots: PlanSlot[]; key: SlotKey; whole?: boolean }): UndoToastWords {
  return notBuilt()
}

/** "1 Stock Lot was already gone, so its Stock was not put back."; null for 0. */
export function stockGoneNote(_gone: number): string | null {
  return notBuilt()
}
