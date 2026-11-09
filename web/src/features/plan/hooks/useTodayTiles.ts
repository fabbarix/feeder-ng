import type { Leftover, PlanSlot } from '../types'

/** GET /api/plan/to-confirm. Live like usePlan. Exported for the Today screen. */
export function useToConfirm(): { slots: PlanSlot[]; isLoading: boolean } {
  return { slots: [], isLoading: false }
}

/** GET /api/plan/couldnt-plan. */
export function useCouldntPlan(): { slots: PlanSlot[]; isLoading: boolean } {
  return { slots: [], isLoading: false }
}

/** GET /api/plan/leftovers. */
export function useLeftovers(): { leftovers: Leftover[]; isLoading: boolean } {
  return { leftovers: [], isLoading: false }
}
