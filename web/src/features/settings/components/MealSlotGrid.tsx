import type { MealSlot, Member } from '../types'

export interface MealSlotGridProps {
  slots: MealSlot[]
  members: Member[]
  canEdit: boolean
  addDisabled?: boolean
  weekStart?: 1 | 6 | 7
  locale?: string
  /** Admin: add a Meal Slot on this weekday with this name. */
  onAdd: (weekday: number) => void
  onOpen: (slot: MealSlot) => void
}

/** STUB (R15 step 2): the desktop week as a table, days as columns, Meal Slot names as rows. */
export function MealSlotGrid(_props: MealSlotGridProps) {
  return null
}
