import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useToast } from '../../../ui'
import { planApi } from '../api'
import { cookedToast, notCookedToast } from '../lib/resolved'
import { planStrings } from '../strings'
import type { CookedResult, SlotKey, StockWarning } from '../types'
import { invalidatePlan } from './planCache'
import { cachedSlots } from './replanState'
import { useReopen } from './useReopen'
import { useMarkCooked, type MarkCookedController } from './useMarkCooked'
import { useStockSheet, type StockSheetController } from './useStockSheet'
import { INERT_CORRECTION, type StockCorrectionController } from '../../stock/hooks/useStockCorrection'
import type { ShortfallGroup } from '../../stock/lib/shortfall'

export interface CookFlow {
  /** Slot whose Mark as Cooked sheet is open, or null. */
  cookKey: SlotKey | null
  /** Opens the Mark as Cooked sheet ("Adjust"). */
  open: (key: SlotKey) => void
  close: () => void
  cook: MarkCookedController
  stock: StockSheetController
  /** Sheet "Mark as Cooked": confirms with the edited Leftover and closes on success; the Cooked toast offers Undo (SAFE-03). */
  confirm: () => Promise<void>
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
  /** Stock shortfall warnings still to show, from either path. */
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
  /** B9-45 (PC-02), not built: one group per Cooked meal still to show in the ONE notice (id "date/slot/course"), newest last. */
  shortfalls: ShortfallGroup[]
  /** B9-45 (PC-02), not built: the notice's Dismiss: clears every group and warning. */
  dismissShortfalls: () => void
  /** B9-45 (PC-02), not built: the ONE Correct Stock sheet of the groups (replaces `stock`, which the developer removes with the old notice). */
  correct: StockCorrectionController
}

/** Mark as Cooked orchestration shared by the Plan and Today: sheet flow (useMarkCooked + useStockSheet) and the one-tap path. */
export function useCookFlow(_options: { toast?: boolean } = {}): CookFlow {
  const client = useQueryClient()
  const toast = useToast()
  const [cookKey, setCookKey] = useState<SlotKey | null>(null)
  const [quickBusy, setQuickBusy] = useState<SlotKey | null>(null)
  const [quick, setQuick] = useState<StockWarning[]>([])
  const cook = useMarkCooked(cookKey)
  const reopen = useReopen()

  const dismissWarning = useCallback(
    (ingredientId: number) => {
      setQuick((ws) => ws.filter((w) => w.ingredientId !== ingredientId))
      cook.dismissWarning(ingredientId)
    },
    [cook],
  )
  const stock = useStockSheet((id) => dismissWarning(id))

  /** The Cooked toast with Undo; a successful Undo also takes its shortfall notice away (PC-02's notice, SAFE-03). */
  const offerCookedUndo = useCallback(
    (key: SlotKey, result: CookedResult, recipeName: string) => {
      const ids = result.warnings.map((w) => w.ingredientId)
      reopen.offerUndo(cookedToast({ slots: cachedSlots(client), key, recipeName: result.meal.recipeName || recipeName, result }), key, () =>
        ids.forEach((id) => dismissWarning(id)),
      )
    },
    [client, reopen, dismissWarning],
  )

  const quickCook = useCallback(
    async (key: SlotKey) => {
      setQuickBusy(key)
      try {
        const preview = await planApi.cookPreview(key)
        const result = await planApi.cooked(key, preview.fresh ? preview.proposedLeftover : undefined)
        setQuick(result.warnings)
        offerCookedUndo(key, result, preview.meal.recipeName)
        await invalidatePlan(client)
        return true
      } catch {
        toast.show(planStrings.cookedError, { status: 'error' })
        return false
      } finally {
        setQuickBusy(null)
      }
    },
    [client, toast, offerCookedUndo],
  )

  const warnings = [...cook.warnings, ...quick.filter((w) => !cook.warnings.some((c) => c.ingredientId === w.ingredientId))]

  return {
    cookKey,
    open: setCookKey,
    close: () => setCookKey(null),
    cook,
    stock,
    confirm: async () => {
      const key = cookKey
      const result = await cook.confirm()
      if (!result || !key) return
      setCookKey(null)
      offerCookedUndo(key, result, cook.preview?.meal.recipeName ?? '')
    },
    skip: async () => {
      const key = cookKey
      if (!key || !(await cook.notCooked())) return
      setCookKey(null)
      reopen.offerUndo(notCookedToast({ slots: cachedSlots(client), key }), key)
    },
    quickCook,
    quickBusy,
    warnings,
    dismissWarning,
    shortfalls: [],
    dismissShortfalls: () => {},
    correct: INERT_CORRECTION,
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
