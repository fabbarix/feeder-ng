import type { ReactNode } from 'react'
import type { AdvanceSummary } from '../lib/advance'

export interface AdvanceStepsTileProps {
  summary: AdvanceSummary
  /** Marks the Advance Step with this Recipe Step index as done. */
  onMarkDone: (stepIndex: number) => void
}

/**
 * Listed above the Step: each done Advance Step as "Done: <text>", each pending
 * one as a warning "Not done yet: <text> (start <lead time> ahead)" (lib/advance.formatLeadTime)
 * with a button "Mark "<text>" as done". Renders nothing when there are no Advance Steps.
 */
export function AdvanceStepsTile(_props: AdvanceStepsTileProps): ReactNode {
  return null
}
