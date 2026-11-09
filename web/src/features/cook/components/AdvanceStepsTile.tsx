import type { ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { formatLeadTime, type AdvanceSummary } from '../lib/advance'
import { cookStrings } from '../strings'

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
export function AdvanceStepsTile({ summary, onMarkDone }: AdvanceStepsTileProps): ReactNode {
  if (summary.done.length === 0 && summary.pending.length === 0) return null
  return (
    <Tile as="section" className="cook-advance">
      <h2 className="cook-advance__heading">{cookStrings.advanceHeading}</h2>
      <ul className="cook-advance__list">
        {summary.done.map((item) => (
          <li key={item.step}>
            <p>{cookStrings.advanceDone(item.text)}</p>
          </li>
        ))}
        {summary.pending.map((item) => (
          <li key={item.step} className="cook-advance__pending">
            <p role="alert">{cookStrings.advanceWarning(item.text, formatLeadTime(item.leadTimeMinutes))}</p>
            <Button variant="tonal" size="md" onClick={() => onMarkDone(item.step)}>
              {cookStrings.markAdvanceDone(item.text)}
            </Button>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
