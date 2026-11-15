import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import { leftoversApi } from '../../../lib/leftovers/api'
import type { Leftover, PlanEntry } from '../types'
import { useScreenState } from '../../../app/useScreenState'
import { usePlanLiveUpdates } from './usePlanLiveUpdates'

const NO_SLOTS: PlanEntry[] = []
const NO_LEFTOVERS: Leftover[] = []
const NOT_A_LIST = { isEmpty: false, hasFilter: false }

/** GET /api/plan/to-confirm. Live like usePlan. Exported for the Today screen. */
export function useToConfirm(): { slots: PlanEntry[]; isLoading: boolean; failed: boolean } {
  usePlanLiveUpdates()
  const q = useQuery({ queryKey: ['plan', 'to-confirm'], queryFn: planApi.toConfirm })
  // B9-20 (RES-02): failed only online; offline with nothing loaded is not an error.
  const failed = useScreenState(q, NOT_A_LIST) === 'failed'
  return { slots: q.data?.slots ?? NO_SLOTS, isLoading: q.isLoading, failed }
}

/** GET /api/plan/couldnt-plan. */
export function useCouldntPlan(): { slots: PlanEntry[]; isLoading: boolean; failed: boolean } {
  usePlanLiveUpdates()
  const q = useQuery({ queryKey: ['plan', 'couldnt-plan'], queryFn: planApi.couldntPlan })
  // B9-20 (RES-02): failed only online; offline with nothing loaded is not an error.
  const failed = useScreenState(q, NOT_A_LIST) === 'failed'
  return { slots: q.data?.slots ?? NO_SLOTS, isLoading: q.isLoading, failed }
}

/**
 * GET /api/plan/leftovers, under the key the Leftover lib shares (['plan', 'leftovers']): the same array, one request.
 * The cache holds the array; the wire object is unwrapped by leftoversApi.list.
 */
export function useLeftovers(): { leftovers: Leftover[]; isLoading: boolean; failed: boolean } {
  usePlanLiveUpdates()
  const q = useQuery({ queryKey: ['plan', 'leftovers'], queryFn: leftoversApi.list })
  // B9-20 (RES-02): failed only online; offline with nothing loaded is not an error.
  const failed = useScreenState(q, NOT_A_LIST) === 'failed'
  return { leftovers: q.data ?? NO_LEFTOVERS, isLoading: q.isLoading, failed }
}
