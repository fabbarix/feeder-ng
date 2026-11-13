// CRS F: the state of the Mark all Cooked sheet (Plan, Today and the end of the cooking timeline).
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { planApi } from '../api'
import { isUsedFromInvalid, normaliseCookPreview, usedFromApi } from '../api.usedFrom'
import { planStrings } from '../strings'
import { usedFromStrings } from '../usedFromStrings'
import { allCookedBody, type AllCookedRow } from '../lib/toConfirm'
import type { CookedAllResult, CookPreview, SlotDayKey, StockWarning } from '../types'
import { invalidatePlan } from './planCache'
import { useCookContext } from './useCookContext'
import { useUsedFrom, type UsedFromController } from './useUsedFrom'

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
  /** The Used from picks per Course (one useUsedFrom over all previews); a conflict between Courses disables confirm. */
  usedFrom: UsedFromController
}

const NONE: never[] = []

/** Idle (no request) while `slot` is null. `slot` is `{ date, mealSlotId }`; `courseIds` are the Courses to cook. */
export function useMarkAllCooked(slot: SlotDayKey | null, courseIds: number[]): MarkAllCookedController {
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

  // Each opening of the sheet starts fresh: the edits, the result, the dismissed warnings and the error belong to one
  // opening. Closing (id null) keeps the result, so the confirmation and its warnings stay on screen after the sheet
  // closes; the next open clears them.
  const id = slot ? `${slot.date}/${slot.mealSlotId}/${courseIds.join(',')}` : null
  const [seen, setSeen] = useState<string | null>(null)
  const [closed, setClosed] = useState(true)
  if (id === null) {
    if (!closed) setClosed(true)
  } else if (closed || id !== seen) {
    setSeen(id)
    setClosed(false)
    setEdited({})
    setResult(null)
    setDismissed([])
    setError(null)
  }

  const loaded = slot !== null && previews.every((q) => q.data !== undefined)
  const cookContext = useCookContext(slot !== null)
  const usedFrom = useUsedFrom(
    loaded
      ? courseIds.map((courseId, i) => {
          const pv = normaliseCookPreview(previews[i]!.data as CookPreview)
          return { courseId, courseName: pv.meal.courseName ?? '', needs: pv.needs }
        })
      : [],
    { unitSystem: cookContext.unitSystem, today: cookContext.today },
  )
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
    // A conflict between Courses (one Lot taken past what it holds) sends nothing.
    if (!slot || !loaded || usedFrom.hasConflict) return null
    setBusy(true)
    setError(null)
    try {
      const courses = allCookedBody(rows).map((entry) => ({ ...entry, usedFrom: usedFrom.entries(entry.courseId) }))
      const res = await usedFromApi.cookedAll(slot, courses)
      setResult(res)
      setDismissed([])
      void invalidatePlan(client)
      return res
    } catch (err) {
      if (isUsedFromInvalid(err)) {
        // A Stock Lot changed under the picks: say so and reload every Course's preview.
        setError(usedFromStrings.refused)
        void client.invalidateQueries({ queryKey: ['plan', 'cook'] })
      } else {
        setError(planStrings.cookedError)
      }
      return null
    } finally {
      setBusy(false)
    }
  }, [slot, loaded, rows, client, usedFrom])

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
    usedFrom,
  }
}
