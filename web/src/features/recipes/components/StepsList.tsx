import type { ReactNode } from 'react'
import { Icon, RecipeThumb } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { stepMeta, usesText } from '../lib/stepText'
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

/** The Steps of a Recipe as numbered rows: a soft number badge, the text, the kind and timing in a meta line, what it uses, its photo. */
export function StepsList({ steps, refs = new Map(), system = 'metric' }: StepsListProps): ReactNode {
  return (
    <ol className="steps-list">
      {steps.map((s, i) => {
        const uses = usesText(s.uses, refs, system)
        return (
          <li key={i} className="steps-list__item">
            <span className="steps-list__number" data-step-number="">
              {i + 1}
            </span>
            <div className="steps-list__body">
              <p className="steps-list__text">{s.text}</p>
              <p className="steps-list__meta" data-kind={s.kind}>
                <Icon name={stepIcon[s.kind]} size={14} />
                {stepMeta(s)}
              </p>
              {uses ? <p className="steps-list__uses">{uses}</p> : null}
              {s.imageUrl ? (
                <div className="steps-list__photo">
                  <RecipeThumb name="" photoUrl={s.imageUrl} size={72} />
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
