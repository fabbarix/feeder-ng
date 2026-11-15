import type { ReactNode } from 'react'
import { Icon, RecipeThumb } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { stepDetail, stepTime } from '../lib/stepText'
import type { IngredientRef, RecipeStep, StepKind } from '../types'

export interface StepsListProps {
  steps: RecipeStep[]
  /** Ingredients by id, to name what a Step uses. */
  refs?: ReadonlyMap<number, IngredientRef>
  system?: UnitSystem
}

const stepIcon: Record<StepKind, 'activeStep' | 'passiveStep' | 'advanceStep'> = {
  active: 'activeStep',
  passive: 'passiveStep',
  advance: 'advanceStep',
}

/**
 * RX-04: the Steps of a Recipe as R-E rows: a soft number badge; the Step text (weight 500); under it the muted detail (kind icon, kind,
 * "After Step 2", "Uses 50 g garlic") and the Step photo; the time at the row's end ("10 min", "12 h before", or "No time" in muted).
 * Shared with Import Review's preview (RX-01).
 */
export function StepsList({ steps, refs = new Map(), system = 'metric' }: StepsListProps): ReactNode {
  return (
    <ol className="steps-list">
      {steps.map((s, i) => {
        const time = stepTime(s)
        return (
          <li key={i} className="steps-list__item">
            <span className="steps-list__number" data-step-number="">
              {i + 1}
            </span>
            <div className="steps-list__body">
              <p className="steps-list__text">{s.text}</p>
              <p className="steps-list__detail" data-kind={s.kind}>
                <Icon name={stepIcon[s.kind]} size={14} />
                <span>{stepDetail(s, refs, system)}</span>
              </p>
              {s.imageUrl ? (
                <div className="steps-list__photo">
                  <RecipeThumb name="" photoUrl={s.imageUrl} size={72} />
                </div>
              ) : null}
            </div>
            <span className="steps-list__time" data-untimed={time.untimed ? 'true' : undefined}>
              {time.text}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
