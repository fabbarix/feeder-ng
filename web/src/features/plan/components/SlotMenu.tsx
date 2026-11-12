import type { ReactNode } from 'react'
import type { PlanSlot, SlotKey } from '../types'

export interface SlotMenuProps {
  slot: PlanSlot
  today: string
  /** The slot, `{ date, mealSlotId }`. */
  onMarkAllCooked: (slot: SlotKey) => void
  onNotCookedSlot: (slot: SlotKey) => void
  /** The key of the empty Course (courseId included). */
  onAddCourse: (key: SlotKey) => void
}

/**
 * STUB (CRS F). The slot block's menu: the shared `Menu` (ui) labelled "<Slot name> actions" (for example "Dinner
 * actions"), items "Mark all Cooked", "Not cooked: whole slot" and "Add <Course>" per lib/courses slotMenu. Renders
 * nothing when slotMenu is null (a one-Course slot).
 */
export function SlotMenu(_props: SlotMenuProps): ReactNode {
  return null
}
