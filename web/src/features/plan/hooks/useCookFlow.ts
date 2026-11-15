import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useToast } from '../../../ui'
import { planApi } from '../api'
import { shortfallGroupFor } from '../lib/cook'
import { cookedToast, notCookedToast } from '../lib/resolved'
import { planStrings } from '../strings'
import type { CookedResult, SlotKey, StockWarning } from '../types'
import { invalidatePlan } from './planCache'
import { cachedSlots } from './replanState'
import { useReopen } from './useReopen'
import { useMarkCooked, type MarkCookedController } from './useMarkCooked'
import { useShortfalls } from './useShortfalls'
import type { StockCorrectionController } from '../../stock/hooks/useStockCorrection'
import type { ShortfallGroup } from '../../stock/lib/shortfall'
import type { UnitSystem } from '../../../lib/units'

export interface CookFlow {
  /** Slot whose Mark as Cooked sheet is open, or null. */
  cookKey: SlotKey | null
  /** Opens the Mark as Cooked sheet ("Adjust"). */
  open: (key: SlotKey) => void
  close: () => void
  cook: MarkCookedController
  /** Sheet "Mark as Cooked": confirms with the edited Leftover and closes on success; the Cooked toast offers Undo (SAFE-03). Resolves the result (null on failure). */
  confirm: () => Promise<CookedResult | null>
  /** Sheet "Not cooked"; the toast offers Undo. */
  skip: () => Promise<void>
  /**
   * "Yes, Cooked" in one tap: GET .../cook for the proposal, POST .../cooked with proposedLeftover (nothing for a meal
   * served from a Leftover), invalidate the plan, the rich Cooked toast (lib/resolved cookedToast) with Undo. A failure toasts the
   * cookedError copy (error) and changes nothing. Resolves true on success, false on failure.
   */
  quickCook: (key: SlotKey) => Promise<boolean>
  /** Key being saved by quickCook, or null. */
  quickBusy: SlotKey | null
  /** Stock shortfall warnings still to show (every group's, one per Ingredient). */
  warnings: StockWarning[]
  /** Takes one Ingredient out of every group (a group left empty goes). */
  dismissWarning: (ingredientId: number) => void
  /** B9-45 (PC-02): one group per Cooked meal still to show in the ONE notice (id "date/slot/course"), newest last. */
  shortfalls: ShortfallGroup[]
  /** B9-45 (PC-02): the notice's Dismiss: clears every group and warning. */
  dismissShortfalls: () => void
  /** B9-45 (PC-02): the ONE Correct Stock sheet of the groups; a save settles the whole notice. */
  correct: StockCorrectionController
  /** The User's unit system for the notice and the sheet (read only while there is a shortfall). */
  system?: UnitSystem
}

/**
 * Mark as Cooked orchestration shared by the Plan, Today and Cook Mode: sheet flow (useMarkCooked) and the one-tap path, the ONE
 * shortfall notice's groups and its ONE Correct Stock sheet (useShortfalls). `toast: false` (Cook Mode, whose confirmation page has
 * its own Undo) shows no Cooked toast.
 */
export function useCookFlow(options: { toast?: boolean } = {}): CookFlow {
  const withToast = options.toast !== false
  const client = useQueryClient()
  const toast = useToast()
  const [cookKey, setCookKey] = useState<SlotKey | null>(null)
  const [quickBusy, setQuickBusy] = useState<SlotKey | null>(null)
  const cook = useMarkCooked(cookKey)
  const reopen = useReopen()
  const notice = useShortfalls()
  const { add, remove } = notice

  /** The meal's group in the ONE notice, and (unless Cook Mode) the Cooked toast whose Undo also takes that group away (SAFE-03). */
  const afterCooked = useCallback(
    (key: SlotKey, result: CookedResult, recipeName: string) => {
      const name = recipeName || result.meal.recipeName
      const group = shortfallGroupFor(cachedSlots(client), key, name, result.warnings)
      add(group)
      if (!withToast) return
      reopen.offerUndo(cookedToast({ slots: cachedSlots(client), key, recipeName: name, result }), key, () => {
        if (group) remove(group.id)
      })
    },
    [client, reopen, add, remove, withToast],
  )

  const quickCook = useCallback(
    async (key: SlotKey) => {
      setQuickBusy(key)
      try {
        const preview = await planApi.cookPreview(key)
        const result = await planApi.cooked(key, preview.fresh ? preview.proposedLeftover : undefined)
        afterCooked(key, result, preview.meal.recipeName)
        await invalidatePlan(client)
        return true
      } catch {
        toast.show(planStrings.cookedError, { status: 'error' })
        return false
      } finally {
        setQuickBusy(null)
      }
    },
    [client, toast, afterCooked],
  )

  return {
    cookKey,
    open: setCookKey,
    close: () => setCookKey(null),
    cook,
    confirm: async () => {
      const key = cookKey
      const result = await cook.confirm()
      if (!result || !key) return null
      setCookKey(null)
      afterCooked(key, result, cook.preview?.meal.recipeName ?? '')
      return result
    },
    skip: async () => {
      const key = cookKey
      if (!key || !(await cook.notCooked())) return
      setCookKey(null)
      reopen.offerUndo(notCookedToast({ slots: cachedSlots(client), key }), key)
    },
    quickCook,
    quickBusy,
    warnings: notice.warnings,
    dismissWarning: notice.dismissWarning,
    shortfalls: notice.groups,
    dismissShortfalls: notice.dismiss,
    correct: notice.correct,
    system: notice.system,
  }
}

/**
 * "Not cooked" straight from a row (To confirm on Today) or a Course menu: POST .../not-cooked at once (no confirm: Undo is the
 * safety net), the one-line toast with Undo (SAFE-03), then the plan refetches. Resolves true on success; a failure toasts and resolves false.
 */
export function useNotCooked(): (key: SlotKey) => Promise<boolean> {
  const client = useQueryClient()
  const toast = useToast()
  const reopen = useReopen()
  return useCallback(
    async (key: SlotKey) => {
      try {
        await planApi.notCooked(key)
      } catch {
        toast.show(planStrings.cookedError, { status: 'error' })
        return false
      }
      reopen.offerUndo(notCookedToast({ slots: cachedSlots(client), key }), key)
      await invalidatePlan(client)
      return true
    },
    [client, toast, reopen],
  )
}
