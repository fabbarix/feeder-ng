import type { ReactNode } from 'react'
import './BentoGrid.css'

/**
 * The minimum width of a tile (docs/design/system.md 4): `metric` a number and a label, `card` a list or recipe card,
 * `day` a Plan day, `wide` a two-up feature tile. The grid fits as many tracks of that width as the row allows.
 */
export type BentoMin = 'metric' | 'card' | 'day' | 'wide'

export interface BentoGridProps {
  /** Minimum tile width (a token, never a column count). Default `card`. */
  min?: BentoMin
  label?: string
  children?: ReactNode
}

/** Lays Tiles out on a grid sized by a minimum tile width. Labelled grids are exposed as a group. */
export function BentoGrid({ min = 'card', label, children }: BentoGridProps) {
  return (
    <div className="bento-grid" data-min={min} role={label ? 'group' : undefined} aria-label={label}>
      {children}
    </div>
  )
}
