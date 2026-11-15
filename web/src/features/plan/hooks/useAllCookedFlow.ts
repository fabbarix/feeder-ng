// CRS F: the Mark all Cooked flow shared by the Plan, Today and Cook Mode (the sheet's open state, its controller, the
// ONE shortfall notice with its ONE Correct Stock sheet, and the outcome toast). The outcome is the same as the single Course's.
// DS-TODAY: quickAll is the one-tap "All Cooked" of a To confirm row: the planned Leftovers, no sheet.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useToast } from '../../../ui'
import { planApi } from '../api'
import { usedFromApi } from '../api.usedFrom'
import { cookedToast } from '../lib/resolved'
import { allCookedBody, previewRows } from '../lib/toConfirm'
import { planStrings } from '../strings'
import type { CookedAllResult, SlotDayKey, StockWarning } from '../types'
import { invalidatePlan } from './planCache'
import { cachedSlots } from './replanState'
import { useReopen } from './useReopen'
import { useShortfalls } from './useShortfalls'
import { cookedAllRecipe, shortfallGroupFor } from '../lib/cook'
import type { StockCorrectionController } from '../../stock/hooks/useStockCorrection'
import type { ShortfallGroup } from '../../stock/lib/shortfall'
import type { UnitSystem } from '../../../lib/units'
import type { MarkAllCookedController } from './useMarkAllCooked'
import { useMarkAllCooked } from './useMarkAllCooked'

export interface AllCookedFlow {
  /** The slot whose sheet is open, or null. */
  key: SlotDayKey | null
  /** Opens the sheet for the slot's Courses still to cook (lib/courses unresolvedCourseIds, or the timeline's unresolvedCourses). */
  open: (slot: SlotDayKey, courseIds: number[]) => void
  close: () => void
  controller: MarkAllCookedController
  /** Stock shortfall warnings still to show (the groups', one per Ingredient). */
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
  /** The sheet's primary button: controller.confirm(); closes on success with the Cooked toast and its Undo; a shortfall stays in `warnings`. */
  confirm: () => Promise<boolean>
  /** DS-TODAY: "All Cooked" in one tap for the slot's Courses (planned Leftovers, no sheet). Resolves true on success. */
  quickAll: (slot: SlotDayKey, courseIds: number[]) => Promise<boolean>
  /** The slot whose one-tap All Cooked is being saved, or null. */
  quickBusy: SlotDayKey | null
  /** B9-45 (PC-02): the slot's group for the ONE notice (id "date/slot"; recipeName null with several Courses, the Recipe's name with one). */
  shortfalls: ShortfallGroup[]
  dismissShortfalls: () => void
  /** B9-45 (PC-02): the ONE Correct Stock sheet. */
  correct: StockCorrectionController
  /** The User's unit system for the notice and the sheet. */
  system?: UnitSystem
}

/** `toast: false` (Cook Mode, whose confirmation page has its own Undo) shows no Cooked toast. */
export function useAllCookedFlow(options: { toast?: boolean } = {}): AllCookedFlow {
  const withToast = options.toast !== false
  const toast = useToast()
  const client = useQueryClient()
  const [key, setKey] = useState<SlotDayKey | null>(null)
  const [courseIds, setCourseIds] = useState<number[]>([])
  const [quickBusy, setQuickBusy] = useState<SlotDayKey | null>(null)
  const controller = useMarkAllCooked(key, courseIds)
  const notice = useShortfalls()
  const { add, remove } = notice
  const reopen = useReopen()
  const open = useCallback((slot: SlotDayKey, ids: number[]) => {
    setKey(slot)
    setCourseIds(ids)
  }, [])
  const close = useCallback(() => setKey(null), [])
  /**
   * The Cooked toast of a Mark all, with one Undo for the whole action (SAFE-03, user decision): it posts to the first Course's
   * reopen, which takes back every Course of that Mark all (the slot-wide .../all/reopen would also reopen earlier marks).
   */
  const offerUndo = useCallback(
    (slot: SlotDayKey, ids: number[], res: CookedAllResult) => {
      const first = ids[0]
      if (first === undefined) return
      const key = { date: slot.date, mealSlotId: slot.mealSlotId, courseId: first }
      const group = shortfallGroupFor(cachedSlots(client), slot, cookedAllRecipe(res), res.warnings)
      add(group)
      if (!withToast) return
      reopen.offerUndo(cookedToast({ slots: cachedSlots(client), key, recipeName: '', result: res, courses: ids.length }), key, () => {
        if (group) remove(group.id)
      })
    },
    [client, reopen, add, remove, withToast],
  )
  const confirm = useCallback(async () => {
    const slot = key
    const res = await controller.confirm()
    if (res === null) return false
    if (slot) offerUndo(slot, courseIds, res)
    setKey(null)
    return true
  }, [controller, key, courseIds, offerUndo])
  const quickAll = useCallback(
    async (slot: SlotDayKey, ids: number[]) => {
      setQuickBusy(slot)
      try {
        const previews = await Promise.all(ids.map((courseId) => planApi.cookPreview({ date: slot.date, mealSlotId: slot.mealSlotId, courseId })))
        const res = await usedFromApi.cookedAll(slot, allCookedBody(previewRows(ids, previews)))
        offerUndo(slot, ids, res)
        await invalidatePlan(client)
        return true
      } catch {
        toast.show(planStrings.cookedError, { status: 'error' })
        return false
      } finally {
        setQuickBusy(null)
      }
    },
    [client, toast, offerUndo],
  )
  return {
    key,
    open,
    close,
    controller,
    warnings: notice.warnings,
    dismissWarning: notice.dismissWarning,
    confirm,
    quickAll,
    quickBusy,
    shortfalls: notice.groups,
    dismissShortfalls: notice.dismiss,
    correct: notice.correct,
    system: notice.system,
  }
}
