import type { ReactNode } from 'react'
import { BentoGrid } from '../../../ui'
import { usePlanGrid, type PlanGridLayout } from '../hooks/usePlanGrid'
import { planStrings } from '../strings'
import '../plan.css'

export interface PlanGridProps {
  /** B9-32: the number of days the layout is made for. */
  count?: number
  /** The day tiles, or a function of the week's layout (columns, spans, rows) that returns them. */
  children?: ReactNode | ((layout: PlanGridLayout) => ReactNode)
}

/**
 * PC-11 option B: the week of day tiles, labelled "Plan". A measured container (.plan-grid, data-columns) holds a
 * twelve-track BentoGrid; each day spans 12 ÷ columns and the days of an incomplete last row share it (usePlanGrid).
 */
export function PlanGrid({ count = 0, children }: PlanGridProps): ReactNode {
  const { ref, ...layout } = usePlanGrid(count)
  return (
    <div className="plan-grid" ref={ref} data-columns={layout.columns}>
      <BentoGrid min="day" label={planStrings.title}>
        {typeof children === 'function' ? children(layout) : children}
      </BentoGrid>
    </div>
  )
}
