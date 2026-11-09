import type { ReactElement } from 'react'
import type { AdvanceStepDue } from '../types'

export interface AdvanceStepsTileProps {
  steps: AdvanceStepDue[]
}

/**
 * "Advance Steps": one row per step with the Recipe name and either "Now, for 19:30"
 * (state due) or "At 15:30, for 19:30" (upcoming). Renders nothing when there are no
 * steps. Not implemented yet.
 */
export function AdvanceStepsTile(_props: AdvanceStepsTileProps): ReactElement | null {
  throw new Error('AdvanceStepsTile: not implemented')
}
