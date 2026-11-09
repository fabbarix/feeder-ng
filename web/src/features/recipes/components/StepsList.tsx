import type { ReactNode } from 'react'
import { formatMinutes } from '../lib/time'
import { recipeStrings } from '../strings'
import type { RecipeStep, StepKind } from '../types'

export interface StepsListProps {
  steps: RecipeStep[]
}

const kindLabel: Record<StepKind, string> = {
  active: recipeStrings.steps.active,
  passive: recipeStrings.steps.passive,
  advance: recipeStrings.steps.advance,
}

/** The Steps of a Recipe, numbered as their `after` references count them, with timing where it applies. */
export function StepsList({ steps }: StepsListProps): ReactNode {
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={i}>
          <span>{s.text}</span>{' '}
          <span>
            ({kindLabel[s.kind]}
            {s.kind === 'advance' ? `, ${formatMinutes(s.leadTimeMinutes)} before` : s.durationMinutes > 0 ? `, ${formatMinutes(s.durationMinutes)}` : ''})
          </span>
          {s.imageUrl ? <img src={s.imageUrl} alt="" className="recipe-step-photo" loading="lazy" /> : null}
        </li>
      ))}
    </ol>
  )
}
