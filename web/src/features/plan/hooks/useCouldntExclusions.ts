import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import { excludedSummary, explanationGroups, type ExplanationGroup } from '../lib/couldntExclusions'
import type { ExclusionCell } from '../types'
import { queryFailed } from './queryFailed'
import { usePlan } from './usePlan'

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

const NO_CELLS: ExclusionCell[] = []

/**
 * GET /api/plan/couldnt-plan/exclusions (query key ['plan', 'couldnt-plan', 'exclusions']) joined with usePlan's slots.
 * Live like usePlan: any `plan` event refetches it.
 */
export function useCouldntExclusions(): CouldntExclusions {
  const plan = usePlan()
  const query = useQuery({
    queryKey: ['plan', 'couldnt-plan', 'exclusions'],
    queryFn: () => planApi.couldntExclusions(),
  })
  const cells = query.data?.cells ?? NO_CELLS
  const slots = plan.slots
  const groups = useMemo(() => explanationGroups(cells, slots), [cells, slots])
  const headline = useMemo(() => excludedSummary(cells, slots), [cells, slots])
  return {
    cells,
    groups,
    headline,
    isLoading: query.isLoading || plan.isLoading,
    failed: queryFailed(query) || plan.failed,
    refetch: query.refetch,
  }
}
