import type { ReactNode } from 'react'
import { isTagColour } from '../../lib/tags/palette'
import './TagColour.css'

export interface TagDotProps {
  /** A TagColourId; anything else (or nothing) draws the neutral dot. */
  colour?: string
}

/** The Tag colour's dot alone, 8 px, decorative: for list rows and select options (spec 4.1). */
export function TagDot({ colour }: TagDotProps): ReactNode {
  return <span className="tag-dot" aria-hidden="true" data-tag-colour={isTagColour(colour) ? colour : undefined} />
}
