import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useToast } from '../../../ui'
import { planApi } from '../api'
import { cookedSuccessText } from '../lib/cook'
import { planStrings } from '../strings'
import type { SlotKey, StockWarning } from '../types'
import { invalidatePlan } from './planCache'
import { useMarkCooked, type MarkCookedController } from './useMarkCooked'
import { useStockSheet, type StockSheetController } from './useStockSheet'

export interface CookFlow {
  /** Slot whose Mark as Cooked sheet is open, or null. */
  cookKey: SlotKey | null
  /** Opens the Mark as Cooked sheet ("Adjust"). */
  open: (key: SlotKey) => void
  close: () => void
  cook: MarkCookedController
  stock: StockSheetController
  /** Sheet "Mark as Cooked": confirms with the edited Leftover and closes on success. */
  confirm: () => Promise<void>
  /** Sheet "Not cooked". */
  skip: () => Promise<void>
  /**
   * "Yes, Cooked" in one tap: GET .../cook for the proposal, POST .../cooked with proposedLeftover (nothing for a meal
   * served from a Leftover), invalidate the plan, toast (success) with lib/cook cookedSuccessText. A failure toasts the
   * cookedError copy (error) and changes nothing. Resolves true on success, false on failure.
   */
  quickCook: (key: SlotKey) => Promise<boolean>
  /** Key being saved by quickCook, or null. */
  quickBusy: SlotKey | null
  /** Stock shortfall warnings still to show, from either path. */
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
}

/** Mark as Cooked orchestration shared by the Plan and Today: sheet flow (useMarkCooked + useStockSheet) and the one-tap path. */
export function useCookFlow(): CookFlow {
  const client = useQueryClient()
  const toast = useToast()
  const [cookKey, setCookKey] = useState<SlotKey | null>(null)
  const [quickBusy, setQuickBusy] = useState<SlotKey | null>(null)
  const [quick, setQuick] = useState<StockWarning[]>([])
  const cook = useMarkCooked(cookKey)

  const dismissWarning = useCallback(
    (ingredientId: number) => {
      setQuick((ws) => ws.filter((w) => w.ingredientId !== ingredientId))
      cook.dismissWarning(ingredientId)
    },
    [cook],
  )
  const stock = useStockSheet((id) => dismissWarning(id))

  const quickCook = useCallback(
    async (key: SlotKey) => {
      setQuickBusy(key)
      try {
        const preview = await planApi.cookPreview(key)
        const result = await planApi.cooked(key, preview.fresh ? preview.proposedLeftover : undefined)
        setQuick(result.warnings)
        toast.show(cookedSuccessText(result), { status: 'success' })
        await invalidatePlan(client)
        return true
      } catch {
        toast.show(planStrings.cookedError, { status: 'error' })
        return false
      } finally {
        setQuickBusy(null)
      }
    },
    [client, toast],
  )

  const warnings = [...cook.warnings, ...quick.filter((w) => !cook.warnings.some((c) => c.ingredientId === w.ingredientId))]

  return {
    cookKey,
    open: setCookKey,
    close: () => setCookKey(null),
    cook,
    stock,
    confirm: async () => {
      if (await cook.confirm()) setCookKey(null)
    },
    skip: async () => {
      if (await cook.notCooked()) setCookKey(null)
    },
    quickCook,
    quickBusy,
    warnings,
    dismissWarning,
  }
}

/** "Not cooked" straight from a row (To confirm on Today): POST .../not-cooked, then the plan refetches; a failure toasts. */
export function useNotCooked(): (key: SlotKey) => Promise<void> {
  const client = useQueryClient()
  const toast = useToast()
  return useCallback(
    async (key: SlotKey) => {
      try {
        await planApi.notCooked(key)
        await invalidatePlan(client)
      } catch {
        toast.show(planStrings.cookedError, { status: 'error' })
      }
    },
    [client, toast],
  )
}
