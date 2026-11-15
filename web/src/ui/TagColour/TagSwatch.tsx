import type { ReactNode } from 'react'

export interface TagSwatchProps {
  /** A TagColourId; anything else (or nothing) draws the neutral square. */
  colour?: string
}

// B9-51 test-author stub (SET-11): the developer builds this. A decorative 40 px square in the Tag's colour pair with the Tag icon (fill).
export function TagSwatch(_props: TagSwatchProps): ReactNode {
  return null
}
