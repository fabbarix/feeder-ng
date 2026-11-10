import type { MealSlot, MealSlotInput } from '../types'

/** The editor's starting state: an existing Meal Slot, or a blank one on Monday. */
export function slotDraft(slot?: MealSlot): MealSlotInput {
  return slot
    ? { weekday: slot.weekday, name: slot.name, time: slot.time, attendance: slot.attendance }
    : { weekday: 1, name: '', time: '', attendance: [] }
}

/** The first thing wrong with the draft, or null. */
export function slotProblem(draft: MealSlotInput): string | null {
  if (draft.name.trim() === '') return 'Enter a name for the Meal Slot.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return 'Enter the usual time for the Meal Slot.'
  return null
}

/** The request body: name trimmed. */
export function slotFromDraft(draft: MealSlotInput): MealSlotInput {
  return { ...draft, name: draft.name.trim() }
}

/** WP11: adding a Meal Slot can cover several weekdays at once. The message when none is chosen, else null. */
export function weekdaysProblem(weekdays: number[]): string | null {
  void weekdays
  throw new Error('not implemented: WP11 weekdaysProblem')
}

/** WP11: one request body per chosen weekday (ISO 1..7), ascending and de-duplicated, each a copy of the draft
 *  with that weekday, the name trimmed and the Attendance copied (not shared). */
export function slotInputsForWeekdays(draft: MealSlotInput, weekdays: number[]): MealSlotInput[] {
  void draft
  void weekdays
  throw new Error('not implemented: WP11 slotInputsForWeekdays')
}

/** WP11: creating several Meal Slots one after another. Stops at the first failure; `created` is how many were saved
 *  before it, `failedWeekday` the weekday that failed (absent when all were saved). */
export interface CreateManyResult {
  created: number
  failedWeekday?: number
  error?: unknown
}
export async function createSlotsSequentially(
  inputs: MealSlotInput[],
  create: (input: MealSlotInput) => Promise<unknown>,
): Promise<CreateManyResult> {
  void inputs
  void create
  throw new Error('not implemented: WP11 createSlotsSequentially')
}
