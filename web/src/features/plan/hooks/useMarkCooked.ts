import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { planApi } from '../api'
import { planStrings } from '../strings'
import { leftoverOutcome, type LeftoverOutcome } from '../lib/cook'
import type { CookedResult, CookPreview, SlotKey, StockWarning } from '../types'
import { invalidatePlan } from './planCache'
import type { UsedFromController } from './useUsedFrom'

export interface MarkCookedController {
  preview: CookPreview | null
  isLoading: boolean
  /** The Leftover portions the ± control shows; starts at preview.proposedLeftover. */
  leftover: number
  setLeftover: (next: number) => void
  /** POST .../cooked with the edited portions; resolves to the result (null on failure, with `error` set). */
  confirm: () => Promise<CookedResult | null>
  notCooked: () => Promise<boolean>
  busy: boolean
  error: string | null
  result: CookedResult | null
  /** Where the Leftover went, from the Cooked result (lib/cook leftoverOutcome); null before Mark as Cooked succeeds. */
  outcome: LeftoverOutcome | null
  /** Shortfall warnings still on screen (dismissed ones are removed). */
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
  /** The Used from picks for the Course (useUsedFrom over preview.needs). Optional until wired (b5-ufw). */
  usedFrom?: UsedFromController
}

const NO_WARNINGS: StockWarning[] = []

/** State of the Mark as Cooked flow for one slot; idle while key is null. */
export function useMarkCooked(key: SlotKey | null): MarkCookedController {
  const client = useQueryClient()
  const q = useQuery({
    queryKey: ['plan', 'cook', key?.date, key?.mealSlotId, key?.courseId],
    queryFn: () => planApi.cookPreview(key!),
    enabled: key !== null,
    gcTime: 0,
  })
  const preview = key === null ? null : (q.data ?? null)
  const [edited, setEdited] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CookedResult | null>(null)
  const [dismissed, setDismissed] = useState<number[]>([])

  // A different slot starts a fresh flow; closing the sheet (key null) keeps the result so its warnings stay on screen.
  const id = key ? `${key.date}/${key.mealSlotId}` : null
  const [seen, setSeen] = useState(id)
  if (id !== null && id !== seen) {
    setSeen(id)
    setEdited(null)
    setResult(null)
    setDismissed([])
    setError(null)
  }

  const refresh = useCallback(() => invalidatePlan(client), [client])

  const confirm = useCallback(async () => {
    if (!key || !preview) return null
    setBusy(true)
    setError(null)
    try {
      const res = await planApi.cooked(key, edited ?? preview.proposedLeftover)
      setResult(res)
      setDismissed([])
      void refresh()
      return res
    } catch {
      setError(planStrings.cookedError)
      return null
    } finally {
      setBusy(false)
    }
  }, [key, preview, edited, refresh])

  const notCooked = useCallback(async () => {
    if (!key) return false
    setBusy(true)
    setError(null)
    try {
      await planApi.notCooked(key)
      void refresh()
      return true
    } catch {
      setError(planStrings.cookedError)
      return false
    } finally {
      setBusy(false)
    }
  }, [key, refresh])

  const warnings = result ? result.warnings.filter((w) => !dismissed.includes(w.ingredientId)) : NO_WARNINGS
  const outcome = useMemo(() => (result ? leftoverOutcome(result) : null), [result])

  return {
    preview,
    isLoading: key !== null && q.isLoading,
    leftover: edited ?? preview?.proposedLeftover ?? 0,
    setLeftover: setEdited,
    confirm,
    notCooked,
    busy,
    error,
    result,
    outcome,
    warnings,
    dismissWarning: (id) => setDismissed((d) => [...d, id]),
  }
}
