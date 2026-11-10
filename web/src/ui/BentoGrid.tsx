import type { ReactNode } from 'react'
import './BentoGrid.css'

export interface BentoGridProps {
  columns?: 2 | 3 | 4
  label?: string
  children?: ReactNode
}

/** Lays Tiles out on a grid. Labelled grids are exposed as a group. */
export function BentoGrid({ columns = 2, label, children }: BentoGridProps) {
  return (
    <div className="bento-grid" data-columns={columns} role={label ? 'group' : undefined} aria-label={label}>
      {children}
    </div>
  )
}
