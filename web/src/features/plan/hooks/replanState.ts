// B9-26 (PC-01): the last plan write's changes, shared through the query cache (REPLAN_QUERY_KEY) by the hooks that write
// (usePlanActions, usePlanLiveUpdates) and the hook that shows them (useReplanReview: the marks, the Review sheet, Undo all).
import type { QueryClient } from '@tanstack/react-query'
import { planApi } from '../api'
import { REPLAN_QUERY_KEY, changedMarks, type PlanActor, type PlanChange, type ReplanKind, type ReplanToast } from '../lib/replan'
import type { PlanSlot, PlanView, SlotKey } from '../types'
import { invalidatePlan } from './planCache'

export interface ReplanState {
  /** The signed-in User's own edit (absent for another User's). */
  kind?: ReplanKind
  /** Another User's edit (the plan event's `by`). */
  by?: PlanActor
  target?: SlotKey
  changes: PlanChange[]
  /** Only the signed-in User's own write holds one (the event never carries it). */
  undoToken?: string
  /** The rows marked "was ...": cleared when Review opens. */
  marks: Record<string, string>
  /** The What changed sheet is open. */
  open: boolean
  /** Another User's edit waiting to be shown by the screen's useReplanReview (`id` once per event). */
  announce?: { id: number; toast: ReplanToast }
  /** The last `announce.id` a useReplanReview showed (so two mounted screens never show it twice). */
  announced?: number
}

export const readReplan = (client: QueryClient) => client.getQueryData<ReplanState | null>(REPLAN_QUERY_KEY) ?? null
/** Never garbage-collected: no query observes it (useReplanReview subscribes to the cache), and the marks stay while the Plan is open. */
export const writeReplan = (client: QueryClient, state: ReplanState | null) => {
  client.setQueryDefaults(REPLAN_QUERY_KEY, { gcTime: Infinity, staleTime: Infinity })
  client.setQueryData<ReplanState | null>(REPLAN_QUERY_KEY, state)
}

/** Subscribes to the shared state only (the cache calls its listeners at once, so a write is seen in the same act). */
export const subscribeReplan = (client: QueryClient, onChange: () => void) =>
  client.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === REPLAN_QUERY_KEY[0]) onChange()
  })
export const updateReplan = (client: QueryClient, update: (s: ReplanState) => ReplanState) => {
  const now = readReplan(client)
  if (now) writeReplan(client, update(now))
}

/** The state after a write that changed `changes`: marked, closed. */
export function replanStateOf(src: Omit<ReplanState, 'marks' | 'open'>): ReplanState {
  return { ...src, marks: changedMarks(src.changes), open: false }
}

/** The slots the words name meals from: the cached plan view, then the cached To confirm entries (a day the view no longer holds). */
export function cachedSlots(client: QueryClient): PlanSlot[] {
  const view = client.getQueryData<PlanView>(['plan', 'view'])?.slots ?? []
  const toConfirm = client.getQueryData<{ slots: PlanSlot[] }>(['plan', 'to-confirm'])?.slots ?? []
  return [...view, ...toConfirm]
}

/**
 * Undo of a replanning write: one POST /api/plan/restore with its token (never a second replan). Success clears the marks; either
 * way the plan is read again. A refusal rejects with the ApiError, for the refused-Undo toast.
 */
export async function restorePlan(client: QueryClient, undoToken: string): Promise<void> {
  try {
    await planApi.restore(undoToken)
    if (readReplan(client)?.undoToken === undoToken) writeReplan(client, null)
  } finally {
    await invalidatePlan(client)
  }
}
