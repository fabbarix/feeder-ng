import type { ReactNode } from 'react'
import { BentoGrid } from '../../../ui'
import { planStrings } from '../strings'
import '../plan.css'

export interface PlanGridProps {
  children?: ReactNode
}

/** The week of day tiles: a BentoGrid min="day" (2 columns on a tablet, 1 on a phone), labelled "Plan". No column count. */
export function PlanGrid({ children }: PlanGridProps): ReactNode {
  return (
    <BentoGrid min="day" label={planStrings.title}>
      {children}
    </BentoGrid>
  )
}
