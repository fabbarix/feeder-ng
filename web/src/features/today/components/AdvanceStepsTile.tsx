import type { ReactElement } from 'react'
import { Tile } from '../../../ui'
import { todayStrings as s } from '../strings'
import type { AdvanceStepDue } from '../types'
import '../today.css'

export interface AdvanceStepsTileProps {
  steps: AdvanceStepDue[]
}

/**
 * "Advance Steps": one row per step with the Recipe name and either "Now, for 19:30"
 * (state due) or "At 15:30, for 19:30" (upcoming). Renders nothing when there are no steps.
 */
export function AdvanceStepsTile({ steps }: AdvanceStepsTileProps): ReactElement | null {
  if (steps.length === 0) return null
  return (
    <Tile as="section" aria-label={s.advanceStepsHeading}>
      <h2 className="today__tile-title">{s.advanceStepsHeading}</h2>
      <ul className="today__list">
        {steps.map((step) => (
          <li key={`${step.mealDate}-${step.mealSlotId}-${step.description}`} className="today__row">
            <span className="today__recipe">{step.recipeName}</span>
            <span>{step.description}</span>
            <span className="today__muted">
              {step.state === 'due' ? s.advanceStepDue(step.slotTime) : s.advanceStepUpcoming(step.dueTime, step.slotTime)}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
