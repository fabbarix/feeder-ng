import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { Leftover, PlanSlot } from '../types'
import { usePlanLiveUpdates } from './usePlanLiveUpdates'

const NO_SLOTS: PlanSlot[] = []
const NO_LEFTOVERS: Leftover[] = []

/** GET /api/plan/to-confirm. Live like usePlan. Exported for the Today screen. */
export function useToConfirm(): { slots: PlanSlot[]; isLoading: boolean } {
  usePlanLiveUpdates()
  const q = useQuery({ queryKey: ['plan', 'to-confirm'], queryFn: planApi.toConfirm })
  return { slots: q.data?.slots ?? NO_SLOTS, isLoading: q.isLoading }
}

/** GET /api/plan/couldnt-plan. */
export function useCouldntPlan(): { slots: PlanSlot[]; isLoading: boolean } {
  usePlanLiveUpdates()
  const q = useQuery({ queryKey: ['plan', 'couldnt-plan'], queryFn: planApi.couldntPlan })
  return { slots: q.data?.slots ?? NO_SLOTS, isLoading: q.isLoading }
}

/** GET /api/plan/leftovers. */
export function useLeftovers(): { leftovers: Leftover[]; isLoading: boolean } {
  usePlanLiveUpdates()
  const q = useQuery({ queryKey: ['plan', 'leftovers'], queryFn: planApi.leftovers })
  return { leftovers: q.data?.leftovers ?? NO_LEFTOVERS, isLoading: q.isLoading }
}
