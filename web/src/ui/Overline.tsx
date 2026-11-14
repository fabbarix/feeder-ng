import type { ReactNode } from 'react'
import './Overline.css'

export interface OverlineProps {
  /** Default p. */
  as?: 'p' | 'span'
  className?: string
  id?: string
  children: ReactNode
}

/**
 * The overline role outside a Tile (DS-07), in --color-muted. Not a heading. Replaces `.settings__overline` and
 * `.access__overline`; a Tile's own `overline` keeps rendering it inside a tone.
 */
export function Overline({ as: Tag = 'p', className, id, children }: OverlineProps) {
  return (
    <Tag id={id} className={className ? `overline ${className}` : 'overline'}>
      {children}
    </Tag>
  )
}
