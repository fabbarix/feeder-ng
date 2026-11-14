import type { ReactNode } from 'react'
import './Muted.css'

export interface MutedProps {
  /** A line of its own (p, the default) or a run inside a sentence or a row (span). */
  as?: 'p' | 'span'
  className?: string
  id?: string
  children: ReactNode
}

/**
 * The one muted line (DS-07): the meta role in --color-muted, never an opacity. Replaces `.pg__muted`, `.settings__muted`,
 * `.access__muted`, `.ra__muted`, `.plan__muted`, `.notifications__muted` and `.read-step__muted`.
 */
export function Muted({ as: Tag = 'p', className, id, children }: MutedProps) {
  return (
    <Tag id={id} className={className ? `muted ${className}` : 'muted'}>
      {children}
    </Tag>
  )
}
