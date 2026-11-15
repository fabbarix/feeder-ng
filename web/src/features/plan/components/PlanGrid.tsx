import type { ReactNode } from 'react'
import { BentoGrid } from '../../../ui'
import type { PlanGridLayout } from '../hooks/usePlanGrid'
import { planStrings } from '../strings'
import '../plan.css'

export interface PlanGridProps {
  /** B9-32: the number of days (the layout is made for it). Test-author stub: not used yet. */
  count?: number
  /** B9-32: the day tiles, or a function of the week's layout (columns, spans, rows) that returns them. */
  children?: ReactNode | ((layout: PlanGridLayout) => ReactNode)
}

/** The week of day tiles: a BentoGrid min="day" (2 columns on a tablet, 1 on a phone), labelled "Plan". No column count. */
export function PlanGrid({ children }: PlanGridProps): ReactNode {
  return (
    <BentoGrid min="day" label={planStrings.title}>
      {typeof children === 'function' ? null : children}
    </BentoGrid>
  )
}
