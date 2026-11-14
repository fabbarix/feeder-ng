import type { ReactNode } from 'react'
import './SectionTitle.css'

export interface SectionTitleProps {
  /** Heading level, as authored (the look is the same); default h2. */
  as?: 'h2' | 'h3'
  className?: string
  id?: string
  children: ReactNode
}

/**
 * The one section heading inside a tile (DS-07): title-3 with --space-3 below it. Replaces `.pg__tile-title`,
 * `.today__tile-title`, `.plan__tile-title` and the unclassed `<h2>` in tiles.
 */
export function SectionTitle({ as: Heading = 'h2', className, id, children }: SectionTitleProps) {
  return (
    <Heading id={id} className={className ? `section-title ${className}` : 'section-title'}>
      {children}
    </Heading>
  )
}
