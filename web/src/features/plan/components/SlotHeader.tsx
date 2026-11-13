import type { ReactNode } from 'react'
import type { PlanSlot, SlotDateActions, SlotDayKey, SlotKey } from '../types'

export interface SlotHeaderProps {
  slot: PlanSlot
  today: string
  onCook: (key: SlotDayKey) => void
  onMarkAllCooked: (slot: SlotDayKey) => void
  onNotCookedSlot: (slot: SlotDayKey) => void
  onAddCourse: (key: SlotKey) => void
  dateActions?: SlotDateActions
}

/** The Meal Slot header row of a day tile: icon and full name (never cut), the slot's actions (Cook, ⋮) grouped at the end. Stub. */
export function SlotHeader(_props: SlotHeaderProps): ReactNode {
  throw new Error('ds-plan: SlotHeader is not implemented')
}
