import type { ReactNode } from 'react'
import './TagColour.css'

export interface TagDotProps {
  /** A TagColourId; anything else (or nothing) draws the neutral dot. */
  colour?: string
}

/** The Tag colour's dot alone, 8 px, decorative: for list rows and select options (spec 4.1). */
export function TagDot({ colour }: TagDotProps): ReactNode {
  void colour
  return null // TG-UI stub
}
