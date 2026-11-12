// CRS F: the Mark all Cooked flow shared by the Plan, Today and Cook Mode (the sheet's open state, its controller, the
// Stock correction and the outcome toast). The outcome is the same as the single Course's: a toast, the shortfalls.
import { useCallback, useState } from 'react'
import { useToast } from '../../../ui'
import { cookedAllSuccessText } from '../lib/cook'
import type { SlotDayKey, StockWarning } from '../types'
import { useStockSheet, type StockSheetController } from './useStockSheet'
import type { MarkAllCookedController } from './useMarkAllCooked'
import { useMarkAllCooked } from './useMarkAllCooked'

export interface AllCookedFlow {
  /** The slot whose sheet is open, or null. */
  key: SlotDayKey | null
  /** Opens the sheet for the slot's Courses still to cook (lib/courses unresolvedCourseIds, or the timeline's unresolvedCourses). */
  open: (slot: SlotDayKey, courseIds: number[]) => void
  close: () => void
  controller: MarkAllCookedController
  /** The "Correct Stock" sheet for the shortfalls of this Mark all Cooked. */
  stock: StockSheetController
  /** Stock shortfall warnings still to show (controller.warnings). */
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
  /** The sheet's primary button: controller.confirm(); closes on success with a success toast; a shortfall stays in `warnings`. */
  confirm: () => Promise<boolean>
}

export function useAllCookedFlow(): AllCookedFlow {
  const toast = useToast()
  const [key, setKey] = useState<SlotDayKey | null>(null)
  const [courseIds, setCourseIds] = useState<number[]>([])
  const controller = useMarkAllCooked(key, courseIds)
  const stock = useStockSheet((id) => controller.dismissWarning(id))
  const open = useCallback((slot: SlotDayKey, ids: number[]) => {
    setKey(slot)
    setCourseIds(ids)
  }, [])
  const close = useCallback(() => setKey(null), [])
  const confirm = useCallback(async () => {
    const res = await controller.confirm()
    if (res === null) return false
    toast.show(cookedAllSuccessText(res), { status: 'success' })
    setKey(null)
    return true
  }, [controller, toast])
  return { key, open, close, controller, stock, warnings: controller.warnings, dismissWarning: controller.dismissWarning, confirm }
}
