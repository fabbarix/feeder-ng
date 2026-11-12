import type { ReactNode } from 'react'
import type { ExplanationGroup } from '../lib/couldntExclusions'

export interface CouldntPlanExclusionTileProps {
  group: ExplanationGroup
  expanded: boolean
  onToggle: () => void
  /** The id of the cell to focus (the URL hash), when it is in this group. */
  focusId?: string | null
}

/** One explanation: the cells, who eats it, who opts out, and one row per Exclusion with its links. Renders only. */
export function CouldntPlanExclusionTile(_props: CouldntPlanExclusionTileProps): ReactNode {
  return null
}
