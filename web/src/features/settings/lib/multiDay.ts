// R15: pure logic of the multi-day Meal Slot edit. STUBS (step 2); see docs/dev/design/r15-meal-slots.md section 5.
import type { MealSlot, MealSlotInput, SlotBatchChange, SlotBatchRequest } from '../types'

export interface QuickPick {
  id: 'same-name' | 'every-day' | 'weekdays' | 'weekend'
  label: string
  /** ISO weekdays, ascending. */
  days: number[]
}

const todo = (): never => {
  throw new Error('not implemented')
}

/** The Meal Slot named `name` (case and edge spaces ignored) on each chosen weekday, and the weekdays without one. */
export function matchingSlots(_slots: MealSlot[], _name: string, _weekdays: number[]): { matched: MealSlot[]; skipped: number[] } {
  return todo()
}
/** Editing `current`: "All days with <name>", "Weekdays", "Weekend". Adding (no current): "Every day", "Weekdays", "Weekend". */
export function quickPicks(_slots: MealSlot[], _current?: MealSlot): QuickPick[] {
  return todo()
}
export function sameDays(_a: number[], _b: number[]): boolean {
  return todo()
}
/** Only the fields that differ from `original` (name trimmed; attendance compared as a set of member and override). */
export function changedFields(_original: MealSlot, _draft: MealSlotInput): SlotBatchChange {
  return todo()
}
export function hasChanges(_change: SlotBatchChange): boolean {
  return todo()
}
export function batchRequest(_original: MealSlot, _weekdays: number[], _draft: MealSlotInput): SlotBatchRequest {
  return todo()
}
/** The summary shown before saving. */
export function summaryLines(_name: string, _matched: MealSlot[], _skipped: number[], _locale = 'en'): { update: string | null; skipped: string[] } {
  return todo()
}
/** The sentence shown after saving. */
export function resultMessage(_name: string, _updated: number[], _skipped: number[], _locale = 'en'): string {
  return todo()
}
