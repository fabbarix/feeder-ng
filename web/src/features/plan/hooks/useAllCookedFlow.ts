// CRS F: the Mark all Cooked flow shared by the Plan, Today and Cook Mode (the sheet's open state and its controller).
import { useCallback, useState } from 'react'
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
  const [key, setKey] = useState<SlotKey | null>(null)
  const [courseIds, setCourseIds] = useState<number[]>([])
  const controller = useMarkAllCooked(key, courseIds)
  const open = useCallback((slot: SlotKey, ids: number[]) => {
    setKey(slot)
    setCourseIds(ids)
  }, [])
  const close = useCallback(() => setKey(null), [])
  const confirm = useCallback(async () => {
    const res = await controller.confirm()
    if (res === null) return false
    setKey(null)
    return true
  }, [controller])
  return { key, open, close, controller, confirm }
}
