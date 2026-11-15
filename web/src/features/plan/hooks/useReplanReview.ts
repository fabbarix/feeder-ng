// B9-26 (PC-01): the Review of the last write's changes, shared by the toast, the Plan screen and the changed rows.
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { undoRefusal, useToast } from '../../../ui'
import { reviewModel, type PlanActor, type PlanChange, type ReplanKind, type ReviewModel } from '../lib/replan'
import { undoStrings as u } from '../strings/undo'
import { cachedSlots, readReplan, restorePlan, subscribeReplan, updateReplan, writeReplan, type ReplanState } from './replanState'

export interface ReplanReviewController {
  /** The "What changed" sheet is open. */
  open: boolean
  /** The sheet's content; null while there is nothing to review. */
  model: ReviewModel | null
  /** The marks on the changed rows by `markKey`: "was Lentil soup". Cleared when Review opens and when the Plan screen unmounts. */
  marks: Record<string, string>
  /** Whether "Undo all" is offered (the signed-in User's own write still holds its token). */
  canUndo: boolean
  busy: boolean
  openReview: () => void
  /** "Keep the changes" and Close: the sheet closes, the marks go, nothing is written. */
  keep: () => void
  /** "Undo all": POST /api/plan/restore with the token; resolves true when it was undone. A refusal is the refused-Undo toast. */
  undoAll: () => Promise<boolean>
}

/**
 * The marks of the changed rows by `markKey` ("was Lentil soup"). The Plan screen provides `review.marks`; PlanCourseRow reads it with
 * useContext (default: no marks), so no prop is passed down through the grid (DayTile, MealTile are B9-32's) and a row outside the
 * Plan screen needs no provider.
 */
export const ReplanMarksContext = createContext<Record<string, string>>({})

export type { PlanActor, PlanChange, ReplanKind }

const NO_MARKS: Record<string, string> = {}

/** Opens What changed for the shared state: the marks go (Review has been seen). */
export const openReplanReview = (s: ReplanState): ReplanState => ({ ...s, open: true, marks: NO_MARKS })

/**
 * Mounted once per screen that shows the plan (the Plan, Today's Tonight sheets). It reads the shared state, shows another User's
 * edit announced by usePlanLiveUpdates({ announce: true }), and clears the state when the screen unmounts (the marks stay until the
 * person leaves the Plan).
 */
export function useReplanReview(): ReplanReviewController {
  const client = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const subscribe = useCallback((onChange: () => void) => subscribeReplan(client, onChange), [client])
  const state = useSyncExternalStore(subscribe, () => readReplan(client))

  useEffect(() => () => void writeReplan(client, null), [client])

  // Another User's edit: shown once, by the first mounted screen that sees it.
  const announceId = state?.announce?.id
  useEffect(() => {
    const now = readReplan(client)
    if (!now?.announce || now.announced === now.announce.id) return
    const { toast: words, id } = now.announce
    writeReplan(client, { ...now, announced: id })
    toast.show({
      status: 'success',
      title: words.headline,
      subline: words.subline,
      body: words.body,
      durationMs: 10_000,
      actions: [{ label: u.review, ariaLabel: words.reviewAriaLabel, onClick: () => updateReplan(client, openReplanReview) }],
    })
  }, [announceId, client, toast])

  // The model follows the shared state; the cached slots only name the meals.
  const model = useMemo(
    () => (state && state.changes.length > 0 ? reviewModel({ kind: state.kind, by: state.by, target: state.target, changes: state.changes, slots: cachedSlots(client) }) : null),
    [state, client],
  )

  const openReview = useCallback(() => updateReplan(client, openReplanReview), [client])
  const keep = useCallback(() => updateReplan(client, (s) => ({ ...s, open: false, marks: NO_MARKS })), [client])
  const undoAll = useCallback(async () => {
    const token = readReplan(client)?.undoToken
    if (!token || busy) return false
    setBusy(true)
    try {
      await restorePlan(client, token)
      updateReplan(client, (s) => ({ ...s, open: false }))
      return true
    } catch (error) {
      updateReplan(client, (s) => ({ ...s, open: false }))
      const refusal = undoRefusal(error)
      toast.show({ status: 'warning', title: refusal.headline, subline: refusal.subline, sticky: true })
      return false
    } finally {
      setBusy(false)
    }
  }, [busy, client, toast])

  return {
    open: Boolean(state?.open && model),
    model,
    marks: state?.marks ?? NO_MARKS,
    canUndo: Boolean(state?.undoToken && !state.by),
    busy,
    openReview,
    keep,
    undoAll,
  }
}
