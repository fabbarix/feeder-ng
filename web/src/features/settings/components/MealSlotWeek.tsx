import type { MealSlot, Member } from '../types'

export interface MealSlotWeekProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  /** Admin: add a Meal Slot starting on this ISO weekday (1..7). */
  onAdd: (weekday: number) => void
  /** Tap on a slot chip: an Admin gets the MealSlot sheet (with "Change a date"), a plain User the one-date Attendance. */
  onOpen: (slot: MealSlot) => void
}

/**
 * STUB (WP11). Seven `role=group aria-label=<weekday>` rows (Monday first, empty ones read "No Meal Slot"), each holding
 * the day's slots as chips "Dinner 19:30" (slot icon from ui/lib/mealSlotIcon, earliest first) and, for an Admin, an
 * IconButton "Add Meal Slot on <weekday>". With no slots at all: EmptyState "No Meal Slots yet". Replaces MealSlotList.
 */
export function MealSlotWeek(_props: MealSlotWeekProps) {
  return null
}
