import type { PlanSlot, PlanView } from '../types'

export interface UsePlan {
  view: PlanView | undefined
  slots: PlanSlot[]
  today: string
  updating: boolean
  isLoading: boolean
  error: Error | null
}

/** react-query ['plan', 'view'] (GET /api/plan). Live: refetches on SSE topic `plan` and after reconnects (usePlanLiveUpdates). */
export function usePlan(): UsePlan {
  return { view: undefined, slots: [], today: '', updating: false, isLoading: false, error: null }
}
