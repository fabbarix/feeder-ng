import type { TodayLayout } from '../types'

export interface UseToday {
  layout: TodayLayout
  loading: boolean
}

/**
 * Today's data: the scan-session flag and the plan and stock counts (seams), plus
 * Advance Steps due and the zero-waste streak (this feature's API), composed with
 * composeToday. Not implemented yet.
 */
export function useToday(): UseToday {
  throw new Error('useToday: not implemented')
}

export interface AdvanceStepsState {
  steps: import('../types').AdvanceStepDue[]
  loading: boolean
}

/** GET /api/today/advance-steps via react-query. Not implemented yet. */
export function useAdvanceStepsDue(): AdvanceStepsState {
  throw new Error('useAdvanceStepsDue: not implemented')
}
