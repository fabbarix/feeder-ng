import type { ReactNode } from 'react'
import { planStrings } from '../strings'
import '../plan.css'

export interface PlanGridProps {
  /** 2 on phones, 4 on tablets, 7 on desktop (hooks/useContainerColumns). */
  columns: 2 | 4 | 7
  children?: ReactNode
}

/**
 * The week grid of day tiles: a labelled group (name "Plan") with data-columns. BentoGrid only knows 2 to 4 columns,
 * so the Plan owns this grid (PRIMITIVE REQUEST: BentoGrid columns 7 would replace it).
 */
export function PlanGrid({ columns, children }: PlanGridProps): ReactNode {
  return (
    <div className="plan-grid" role="group" aria-label={planStrings.title} data-columns={columns}>
      {children}
    </div>
  )
}
