// CRS F: the Mark all Cooked flow shared by the Plan, Today and Cook Mode (the sheet's open state and its controller). STUB (inert).
import type { SlotKey } from '../types'
import type { MarkAllCookedController } from './useMarkAllCooked'
import { useMarkAllCooked } from './useMarkAllCooked'

export interface AllCookedFlow {
  /** The slot whose sheet is open, or null. */
  key: SlotKey | null
  /** Opens the sheet for the slot's Courses still to cook (lib/courses unresolvedCourseIds, or the timeline's unresolvedCourses). */
  open: (slot: SlotKey, courseIds: number[]) => void
  close: () => void
  controller: MarkAllCookedController
  /** The sheet's primary button: controller.confirm(); closes on success; a Stock shortfall stays in `controller.warnings`. */
  confirm: () => Promise<boolean>
}

export function useAllCookedFlow(): AllCookedFlow {
  const controller = useMarkAllCooked(null, [])
  return { key: null, open: () => {}, close: () => {}, controller, confirm: async () => false }
}
