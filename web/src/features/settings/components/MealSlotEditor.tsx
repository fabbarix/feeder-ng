import type { MealSlot, MealSlotInput, Member } from '../types'

export interface MealSlotEditorProps {
  open: boolean
  slot?: MealSlot
  members: Member[]
  saving?: boolean
  error?: string
  onSave: (input: MealSlotInput) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onClose: () => void
}

/** A BottomSheet "Add Meal Slot" / "Edit Meal Slot": Weekday select, Name, Usual time, AttendanceEditor;
 *  buttons "Save Meal Slot" and "Remove Meal Slot" (editing only). */
export function MealSlotEditor(_props: MealSlotEditorProps) {
  return null
}
