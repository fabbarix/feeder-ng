import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { PlanSlot, PlanView } from '../types'
import { queryFailed } from './queryFailed'
import { usePlanLiveUpdates } from './usePlanLiveUpdates'

export interface UsePlan {
  view: PlanView | undefined
  slots: PlanSlot[]
  today: string
  updating: boolean
  isLoading: boolean
  error: Error | null
  /** No data and the fetch failed or is waiting for the network (offline): an error to show, never an empty plan. */
  failed: boolean
  refetch: () => Promise<unknown>
}

const NO_SLOTS: PlanSlot[] = []

/** react-query ['plan', 'view'] (GET /api/plan). Live: refetches on SSE topic `plan` and after reconnects (usePlanLiveUpdates). */
export function usePlan(): UsePlan {
  usePlanLiveUpdates()
  // While the planner is catching up, poll so the "Updating" note clears even if an event was missed.
  const query = useQuery({
    queryKey: ['plan', 'view'],
    queryFn: () => planApi.view(),
    refetchInterval: (q) => (q.state.data?.updating ? 2000 : false),
  })
  const view = query.data
  return {
    view,
    slots: view?.slots ?? NO_SLOTS,
    today: view?.today ?? '',
    updating: view?.updating ?? false,
    isLoading: query.isLoading,
    error: query.error,
    failed: queryFailed(query),
    refetch: query.refetch,
  }
}
