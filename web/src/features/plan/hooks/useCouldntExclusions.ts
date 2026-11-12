import type { ExclusionCell } from '../types'
import type { ExplanationGroup } from '../lib/couldntExclusions'

export interface CouldntExclusions {
  cells: ExclusionCell[]
  /** The explanations (lib explanationGroups), joined with the plan's slots. */
  groups: ExplanationGroup[]
  /** The headline of the summary Tile; null when no Course is held back by Exclusions. */
  headline: string | null
  isLoading: boolean
  failed: boolean
  refetch: () => Promise<unknown>
}

/**
 * GET /api/plan/couldnt-plan/exclusions (query key ['plan', 'couldnt-plan', 'exclusions']) joined with usePlan's slots.
 * Live like usePlan: any `plan` event refetches it.
 */
export function useCouldntExclusions(): CouldntExclusions {
  throw new Error('CRS G2: not implemented')
}
