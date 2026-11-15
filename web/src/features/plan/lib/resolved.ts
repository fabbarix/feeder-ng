// B9-26 (SAFE-03): how a Cooked or Not cooked meal was marked and whether it can still be undone: the sheet's words and the
// toasts' words. Plain TypeScript, no React.
import { isValidTimeZone } from '../../../lib/householdDate'
import { undoStrings as u } from '../strings/undo'
import type { CookedAllResult, CookedResult, MealResolution, PlanSlot, SlotKey } from '../types'
import { cookedAllOutcomes, formatPortions, leftoverOutcome, type LeftoverOutcome } from './cook'
import { weekdayName } from './phrase'
import { mealLabel } from './replan'

export type { MealResolution }

export interface UndoToastWords {
  headline: string
  subline?: string
  body?: string
  undoAriaLabel: string
  /** "Sat Breakfast is back in To confirm". */
  restored: string
}

const kindWord = (r: MealResolution) => (r.kind === 'cooked' ? u.kindCooked : u.kindNotCooked)

/** "08:40": the time of day of an RFC 3339 instant in the Household zone; null without a zone or a valid instant. */
function timeOfDay(at: string | undefined, timeZone: string | undefined): string | null {
  if (!at || !timeZone || !isValidTimeZone(timeZone)) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

/** The sheet's summary: "Marked Cooked today at 08:40 by Anna. 1.25 portions were kept as a Leftover." */
export function resolvedSummary(r: MealResolution, ctx: { today: string; timeZone?: string }): string {
  const when = !r.markedOn || r.markedOn === ctx.today ? u.markedToday : u.markedOn(weekdayName(r.markedOn, 'short'))
  const head = u.summary(kindWord(r), when, timeOfDay(r.markedAt, ctx.timeZone), r.markedBy || null)
  if (r.kind !== 'cooked' || !(r.leftoverPortions > 0)) return head
  return `${head} ${u.leftoverKept(formatPortions(r.leftoverPortions), r.leftoverPortions)}`
}

/** The sheet's muted hint: why and until when it can be undone, or why it can no longer be. */
export function resolvedHint(r: MealResolution, _ctx: { today: string }): string {
  if (r.canUndo) return r.kind === 'cooked' ? u.hintCooked : u.hintNotCooked
  if (r.cannotUndo === 'leftover_used') return u.hintLeftoverUsed(kindWord(r))
  if (r.cannotUndo === 'window_over' && r.markedOn) return u.hintWindowOver(weekdayName(r.markedOn, 'short'))
  return u.hintCannotUndo
}

/** The buttons of the sheet: Cooked: Undo Cooked; Not cooked: Cooked after all (primary) and Undo Not cooked. None when it cannot be undone. */
export function resolvedActions(r: MealResolution): { id: 'undoCooked' | 'cookedAfterAll' | 'undoNotCooked'; label: string; primary: boolean }[] {
  if (!r.canUndo) return []
  if (r.kind === 'cooked') return [{ id: 'undoCooked', label: u.undoCooked, primary: false }]
  return [
    { id: 'cookedAfterAll', label: u.cookedAfterAll, primary: true },
    { id: 'undoNotCooked', label: u.undoNotCooked, primary: false },
  ]
}

/** How many Courses of the slot one Mark all marked (same kind, markedBy and markedAt as this Course); 1 for a single mark. */
export function markedTogether(slot: PlanSlot, courseId: number): number {
  const courses = slot.courses ?? []
  const own = courses.find((c) => c.courseId === courseId)?.meal?.resolution
  if (!own || !own.markedAt) return 1
  const n = courses.filter((c) => {
    const r = c.meal?.resolution
    return r && r.kind === own.kind && r.markedAt === own.markedAt && r.markedBy === own.markedBy
  }).length
  return Math.max(1, n)
}

/** Where one Leftover went: "1.25 portions kept as a Leftover, good until Tue." / "2 portions planned for Thu Lunch." */
function outcomeSentence(o: LeftoverOutcome): string | undefined {
  if (o.kind === 'none') return undefined
  if (o.kind === 'kept') return u.keptAsLeftover(formatPortions(o.portions), weekdayName(o.useBy, 'short'))
  const meals = o.meals.map((m) => u.slotLabel(weekdayName(m.date, 'short'), m.mealSlotName)).join(' and ')
  return u.plannedFor(formatPortions(o.portions), meals)
}

/** The slot alone: "Tue Dinner" (a Mark all is about the whole slot, not one Course). */
const slotLabelOf = (slots: PlanSlot[], key: SlotKey) => {
  const slot = slots.find((s) => s.date === key.date && s.mealSlotId === key.mealSlotId)
  return slot ? u.slotLabel(weekdayName(key.date, 'short'), slot.name) : weekdayName(key.date, 'short')
}

/** The toast after one Course Cooked (CookedResult) or a Mark all Cooked (CookedAllResult, `courses` given). */
export function cookedToast(src: { slots: PlanSlot[]; key: SlotKey; recipeName: string; result: CookedResult | CookedAllResult; courses?: number }): UndoToastWords {
  if ('leftovers' in src.result) {
    const result = src.result
    const label = slotLabelOf(src.slots, src.key)
    const outcomes = cookedAllOutcomes(result)
    const parts = outcomes.map((o, i) => (outcomes.length === 1 ? outcomeSentence(o) : u.byRecipe(result.leftovers[i]!.recipeName, outcomeSentence(o) ?? '')))
    const words: UndoToastWords = {
      headline: u.cookedCheer,
      subline: label,
      undoAriaLabel: (src.courses ?? 1) > 1 ? u.undoCookedAll(src.courses!) : u.undoCookedFor(label),
      restored: u.backInToConfirm(label),
    }
    const body = parts.filter(Boolean).join(' ')
    if (body) words.body = body
    return words
  }
  const label = mealLabel(src.slots, src.key)
  const words: UndoToastWords = {
    headline: u.cookedCheer,
    subline: src.recipeName ? u.cookedSubline(label, src.recipeName) : label,
    undoAriaLabel: u.undoCookedFor(label),
    restored: u.backInToConfirm(label),
  }
  const body = outcomeSentence(leftoverOutcome(src.result))
  if (body) words.body = body
  return words
}

/** The toast after Not cooked, for one Course (`key.courseId`) or the whole slot (`whole`). */
export function notCookedToast(src: { slots: PlanSlot[]; key: SlotKey; whole?: boolean }): UndoToastWords {
  const label = src.whole ? slotLabelOf(src.slots, src.key) : mealLabel(src.slots, src.key)
  return { headline: u.notCookedMarked(label), undoAriaLabel: u.undoNotCookedFor(label), restored: u.backInToConfirm(label) }
}

/** "1 Stock Lot was already gone, so its Stock was not put back."; null for 0. */
export function stockGoneNote(gone: number): string | null {
  return gone > 0 ? u.stockGone(gone) : null
}

/**
 * "Sat Breakfast is back in To confirm" after an Undo from the Planned Meal sheet; the slot alone when the Course was marked
 * together with others by one Mark all (they all come back).
 */
export function reopenedText(slots: PlanSlot[], key: SlotKey): string {
  const slot = slots.find((s) => s.date === key.date && s.mealSlotId === key.mealSlotId)
  const together = slot ? markedTogether(slot, key.courseId) > 1 : false
  return u.backInToConfirm(together ? slotLabelOf(slots, key) : mealLabel(slots, key))
}

/** The Undo button of the sheet names the whole action when one Mark all marked several Courses: "Undo Cooked for all 3 Courses". */
export function resolvedActionLabel(action: { id: string; label: string }, slot: PlanSlot, courseId: number): string {
  const n = markedTogether(slot, courseId)
  if (n > 1 && action.id === 'undoCooked') return u.undoCookedAll(n)
  return action.label
}
