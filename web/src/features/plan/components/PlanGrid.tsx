import type { ReactNode } from 'react'
import '../plan.css'

export interface PlanGridProps {
  /** 2 on phones, 4 on tablets, 7 on desktop (hooks/usePlanColumns). */
  columns: 2 | 4 | 7
  children?: ReactNode
}

/**
 * The week grid of day tiles: a labelled group (name "Plan") with data-columns. BentoGrid only knows 2 to 4 columns,
 * so the Plan owns this grid (PRIMITIVE REQUEST: BentoGrid columns 7 would replace it).
 */
export function PlanGrid(_props: PlanGridProps): ReactNode {
  throw new Error('not implemented (WP6)')
}
