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
