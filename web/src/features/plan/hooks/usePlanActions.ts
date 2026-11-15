import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useToast, useUndoToast, type ToastAction } from '../../../ui'
import { planApi, type ReplanFields } from '../api'
import { replanToast, type ReplanKind } from '../lib/replan'
import { notCookedToast } from '../lib/resolved'
import { undoStrings as u } from '../strings/undo'
import type { SlotDayKey, SlotKey } from '../types'
import { invalidatePlan } from './planCache'
import { cachedSlots, replanStateOf, restorePlan, updateReplan, writeReplan } from './replanState'
import { useReopen } from './useReopen'
import { openReplanReview } from './useReplanReview'

export interface UsePlanActions {
  /** Redoes the unpinned Planned Meals; resolves true when the plan was regenerated. Toasts the count with Undo (SAFE-07). */
  regenerate: () => Promise<boolean>
  regenerating: boolean
  /**
   * Sets the Recipe of a slot (and pins it, on the server). Resolves true on success. B9-26 (PC-01): `kind` words the "What changed" toast
   * ('swap': "Swapped Tue Breakfast"; 'choose', the default: "Recipe chosen for Tue Breakfast").
   */
  setMeal: (key: SlotKey, recipeId: number, kind?: 'swap' | 'choose') => Promise<boolean>
  /** Pin the Planned Meal (POST .../confirm on the server; the UI word is Pin). */
  pin: (key: SlotKey) => Promise<boolean>
  unpin: (key: SlotKey) => Promise<boolean>
  /** CRS F: POST .../all/not-cooked for the slot (Not cooked: whole slot), then the plan refetches; toasts with Undo (SAFE-03). Resolves true on success. */
  notCookedSlot: (slot: SlotDayKey) => Promise<boolean>
  /** Message of the last failed action, or null. */
  error: string | null
}

/** The rich What changed toast stays 10 s (PC-01); a one-line toast keeps the Undo's own 8 s. */
const REVIEW_TOAST_MS = 10_000

/**
 * Mutations on the plan; each invalidates ['plan'] on success. B9-26 (PC-01): a replanning write says what it changed beyond its
 * target ("What changed": Review and Undo), shares the changes for the marked rows and the Review sheet, and its Undo is one
 * POST /api/plan/restore with the server's token.
 */
export function usePlanActions(): UsePlanActions {
  const client = useQueryClient()
  const toast = useToast()
  const undoToast = useUndoToast()
  const reopen = useReopen()
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(call: () => Promise<T>, after?: (res: T) => void): Promise<boolean> => {
      setError(null)
      try {
        const res = await call()
        after?.(res)
        await invalidatePlan(client)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        await invalidatePlan(client)
        return false
      }
    },
    [client],
  )

  /** Shares the changes (marks, Review) and shows What changed for the signed-in User's own write. */
  const announce = useCallback(
    (kind: ReplanKind, target: SlotKey | undefined, res: ReplanFields & { changed?: number }) => {
      const changes = res.changes ?? []
      const slots = cachedSlots(client)
      const words = replanToast({ kind, target, changes, slots, changed: res.changed })
      // Regenerate marks no rows (most of the week moved; SAFE-07 is a count and Undo); every write replaces the last one's marks.
      writeReplan(client, kind === 'regenerate' || (changes.length === 0 && !res.undoToken) ? null : replanStateOf({ kind, target, changes, undoToken: res.undoToken }))
      if (!words) return
      const actions: ToastAction[] = words.review
        ? [{ label: u.review, ariaLabel: words.reviewAriaLabel, onClick: () => updateReplan(client, openReplanReview) }]
        : []
      const durationMs = words.review ? REVIEW_TOAST_MS : undefined
      const token = res.undoToken
      if (token && res.changed !== 0) {
        undoToast.show({
          headline: words.headline,
          subline: words.subline,
          body: words.body,
          actions,
          undoAriaLabel: words.undoAriaLabel,
          restored: kind === 'regenerate' ? u.regenerateUndone : undefined,
          durationMs,
          undo: () => restorePlan(client, token),
        })
      } else {
        toast.show({ status: 'success', title: words.headline, subline: words.subline, body: words.body, actions, durationMs })
      }
    },
    [client, toast, undoToast],
  )

  const regenerate = useCallback(async () => {
    setRegenerating(true)
    try {
      return await run(
        () => planApi.regenerate(),
        (res) => announce('regenerate', undefined, res ?? { changed: 0 }),
      )
    } finally {
      setRegenerating(false)
    }
  }, [run, announce])

  const notCookedSlot = useCallback(
    (slot: SlotDayKey) =>
      run(
        () => planApi.notCookedAll(slot),
        (res) => {
          const first = res?.meals?.[0]
          if (!first) return
          const key = { date: slot.date, mealSlotId: slot.mealSlotId, courseId: first.courseId ?? 1 }
          reopen.offerUndo(notCookedToast({ slots: cachedSlots(client), key, whole: true }), key)
        },
      ),
    [run, reopen, client],
  )

  return {
    regenerate,
    regenerating,
    setMeal: (key, recipeId, kind = 'choose') => run(() => planApi.setMeal(key, recipeId), (res) => announce(kind, key, res)),
    pin: (key) => run(() => planApi.confirm(key), (res) => announce('pin', key, res)),
    unpin: (key) => run(() => planApi.unpin(key), (res) => announce('unpin', key, res)),
    notCookedSlot,
    error,
  }
}
