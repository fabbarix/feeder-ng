// CRS F: the state of the Mark all Cooked sheet (Plan, Today and the end of the cooking timeline).
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { planApi } from '../api'
import { planStrings } from '../strings'
import { allCookedBody, type AllCookedRow } from '../lib/toConfirm'
import type { CookedAllResult, CookPreview, SlotKey, StockWarning } from '../types'
import { invalidatePlan } from './planCache'

export interface MarkAllCookedController {
  /** One row per Course in `courseIds`, in that order, from GET .../{courseId}/cook; empty until every preview has loaded. */
  rows: AllCookedRow[]
  isLoading: boolean
  /** Sets one fresh Course's Leftover (clamped to 0..maxLeftover; a Leftover Course is ignored). */
  setLeftover: (courseId: number, portions: number) => void
  /** POST .../all/cooked with lib/toConfirm allCookedBody(rows); resolves the result, or null on failure with `error` set. Refetches ['plan']. */
  confirm: () => Promise<CookedAllResult | null>
  busy: boolean
  error: string | null
  result: CookedAllResult | null
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
}

const NONE: never[] = []

/** Idle (no request) while `slot` is null. `slot` is `{ date, mealSlotId }`; `courseIds` are the Courses to cook. */
export function useMarkAllCooked(slot: SlotKey | null, courseIds: number[]): MarkAllCookedController {
  const client = useQueryClient()
  const previews = useQueries({
    queries: courseIds.map((courseId) => ({
      queryKey: ['plan', 'cook', slot?.date, slot?.mealSlotId, courseId],
      queryFn: () => planApi.cookPreview({ date: slot!.date, mealSlotId: slot!.mealSlotId, courseId }),
      enabled: slot !== null,
      gcTime: 0,
    })),
  })
  const [edited, setEdited] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CookedAllResult | null>(null)
  const [dismissed, setDismissed] = useState<number[]>([])

  // A different slot starts a fresh sheet: the edits, the result and the dismissed warnings belong to one slot. Closing
  // the sheet (id null) keeps the result, so the confirmation and its warnings stay on screen after the sheet closes.
  const id = slot ? `${slot.date}/${slot.mealSlotId}/${courseIds.join(',')}` : null
  const [seen, setSeen] = useState(id)
  if (id !== null && id !== seen) {
    setSeen(id)
    setEdited({})
    setResult(null)
    setDismissed([])
    setError(null)
  }

  const loaded = slot !== null && previews.every((q) => q.data !== undefined)
  const rows: AllCookedRow[] = loaded
    ? courseIds.map((courseId, i) => {
        const preview = previews[i]!.data as CookPreview
        const fresh = preview.fresh
        const max = preview.maxLeftover
        const value = edited[courseId] ?? preview.proposedLeftover
        return {
          courseId,
          courseName: preview.meal.courseName ?? '',
          recipeName: preview.meal.recipeName,
          fresh,
          proposedLeftover: preview.proposedLeftover,
          maxLeftover: max,
          leftover: fresh ? Math.min(Math.max(value, 0), max) : 0,
          leftoverUseBy: preview.leftoverUseBy,
        }
      })
    : NONE

  const setLeftover = useCallback(
    (courseId: number, portions: number) => {
      const row = rows.find((r) => r.courseId === courseId)
      if (!row || !row.fresh) return
      setEdited((prev) => ({ ...prev, [courseId]: Math.min(Math.max(portions, 0), row.maxLeftover) }))
    },
    [rows],
  )

  const confirm = useCallback(async () => {
    if (!slot || !loaded) return null
    setBusy(true)
    setError(null)
    try {
      const res = await planApi.cookedAll(slot, allCookedBody(rows))
      setResult(res)
      setDismissed([])
      void invalidatePlan(client)
      return res
    } catch {
      setError(planStrings.cookedError)
      return null
    } finally {
      setBusy(false)
    }
  }, [slot, loaded, rows, client])

  const warnings = (result?.warnings ?? NONE).filter((w) => !dismissed.includes(w.ingredientId))

  return {
    rows,
    isLoading: slot !== null && previews.some((q) => q.isLoading),
    setLeftover,
    confirm,
    busy,
    error,
    result,
    warnings,
    dismissWarning: (ingredientId) => setDismissed((prev) => [...prev, ingredientId]),
  }
}
