import type { MealSlot, Member } from '../types'

export interface MealSlotListProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  onAdd: () => void
  onEdit: (slot: MealSlot) => void
  /** Any User: change one date's Attendance. */
  onEditDate: (slot: MealSlot) => void
}

/** Slots grouped under weekday headings (only weekdays that have slots). Each shows name, time, portions and
 *  Attendance avatars; buttons "Edit <name> on <weekday>" (Admin) and "Change <name> on a date" (everyone). */
export function MealSlotList(_props: MealSlotListProps) {
  return null
}
