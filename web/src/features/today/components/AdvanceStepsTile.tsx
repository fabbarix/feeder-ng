import type { ReactElement } from 'react'
import { Icon, Tile } from '../../../ui'
import { todayStrings as s } from '../strings'
import type { AdvanceStepDue } from '../types'
import '../today.css'

export interface AdvanceStepsTileProps {
  steps: AdvanceStepDue[]
}

/**
 * "Advance Steps": a half surface tile, one row per step with the due time big (alarm icon), the Recipe name, the
 * step and either "Now, for 19:30" (state due) or "At 15:30, for 19:30" (upcoming). Renders nothing when there are none.
 */
export function AdvanceStepsTile({ steps }: AdvanceStepsTileProps): ReactElement | null {
  if (steps.length === 0) return null
  return (
    <Tile as="section" aria-label={s.advanceStepsHeading}>
      <h2 className="today__tile-title">{s.advanceStepsHeading}</h2>
      <ul className="today__list">
        {steps.map((step) => (
          <li key={`${step.mealDate}-${step.mealSlotId}-${step.description}`} className="today__step">
            <span className="today__time">
              <Icon name="advanceStep" size={16} />
              {step.dueTime}
            </span>
            <span className="today__recipe">{step.recipeName}</span>
            <span>{step.description}</span>
            <span className="today__hint">
              {step.state === 'due' ? s.advanceStepDue(step.slotTime) : s.advanceStepUpcoming(step.dueTime, step.slotTime)}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
