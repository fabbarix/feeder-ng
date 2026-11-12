import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Tile } from '../../../ui'
import { planStrings as s } from '../strings'
import '../plan.css'

export interface CouldntPlanExclusionSummaryProps {
  /** "Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it." */
  headline: string
}

/** The page's first Tile: the Excluded headline and a link to the Plan to choose a Recipe by hand. */
export function CouldntPlanExclusionSummary({ headline }: CouldntPlanExclusionSummaryProps): ReactNode {
  const headingId = useId()
  return (
    <Tile as="section" aria-labelledby={headingId} variant="status" status="spoil" overline={s.couldntPlanTitle} overlineIcon="exclusion" className="plan-couldnt">
      <h2 id={headingId} className="plan__tile-title">
        {headline}
      </h2>
      <p className="plan__muted">{s.couldntExclusions.summaryHint}</p>
      <div className="plan__row">
        <Link className="button" data-variant="tertiary" data-size="sm" to="/plan">
          {s.couldntExclusions.openPlan}
        </Link>
      </div>
    </Tile>
  )
}
