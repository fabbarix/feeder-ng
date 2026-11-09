import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { PlanSlot, PlanView } from '../types'
import { usePlanLiveUpdates } from './usePlanLiveUpdates'

export interface UsePlan {
  view: PlanView | undefined
  slots: PlanSlot[]
  today: string
  updating: boolean
  isLoading: boolean
  error: Error | null
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
  }
}
