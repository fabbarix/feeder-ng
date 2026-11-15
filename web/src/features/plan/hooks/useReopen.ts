// B9-26 (SAFE-03): Undo of Cooked and Not cooked is POST .../reopen of one Course (the server takes back the whole action that
// marked it: every Course of a Mark all, never earlier marks). Shared by the cook flows, Not cooked and the Planned Meal sheet.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { undoRefusal, useToast, useUndoToast } from '../../../ui'
import { planApi } from '../api'
import { stockGoneNote, type UndoToastWords } from '../lib/resolved'
import type { SlotKey } from '../types'
import { invalidatePlan } from './planCache'

export interface ReopenApi {
  /** The toast after Cooked or Not cooked, with its Undo; `onUndone` runs after a successful Undo (the shortfall notice goes). */
  offerUndo: (words: UndoToastWords, key: SlotKey, onUndone?: () => void) => void
  /** Undo straight away (the Planned Meal sheet): resolves true when reopened; a refusal shows "Nothing was undone" and resolves false. */
  undoNow: (key: SlotKey, restored: string) => Promise<boolean>
}

export function useReopen(): ReopenApi {
  const client = useQueryClient()
  const toast = useToast()
  const undoToast = useUndoToast()

  /** Reopens, says "Sat Dinner is back in To confirm" (and any Stock Lot already gone); the plan is read again either way. Rejects on a refusal. */
  const reopen = useCallback(
    async (key: SlotKey, restored: string) => {
      try {
        const res = await planApi.reopen(key)
        toast.show({ status: 'success', title: restored, subline: stockGoneNote(res.stockGone) ?? undefined })
      } finally {
        await invalidatePlan(client)
      }
    },
    [client, toast],
  )

  const offerUndo = useCallback(
    (words: UndoToastWords, key: SlotKey, onUndone?: () => void) => {
      undoToast.show({
        headline: words.headline,
        subline: words.subline,
        body: words.body,
        undoAriaLabel: words.undoAriaLabel,
        undo: async () => {
          await reopen(key, words.restored)
          onUndone?.()
        },
      })
    },
    [reopen, undoToast],
  )

  const undoNow = useCallback(
    async (key: SlotKey, restored: string) => {
      try {
        await reopen(key, restored)
        return true
      } catch (error) {
        const refusal = undoRefusal(error)
        toast.show({ status: 'warning', title: refusal.headline, subline: refusal.subline, sticky: true })
        return false
      }
    },
    [reopen, toast],
  )

  return useMemo(() => ({ offerUndo, undoNow }), [offerUndo, undoNow])
}
