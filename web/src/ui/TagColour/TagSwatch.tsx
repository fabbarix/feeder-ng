import type { ReactNode } from 'react'
import { isTagColour } from '../../lib/tags/palette'
import { Icon } from '../Icon'
import './TagSwatch.css'

export interface TagSwatchProps {
  /** A TagColourId; anything else (or nothing) draws the neutral square. */
  colour?: string
}

/** SET-11: the leading 40 px square of a Tags row, in the Tag's colour pair, with the Tag icon (fill). Decorative. */
export function TagSwatch({ colour }: TagSwatchProps): ReactNode {
  return (
    <span className="tag-lead" aria-hidden="true" data-tag-colour={isTagColour(colour) ? colour : undefined}>
      <Icon name="tag" size={20} weight="fill" />
    </span>
  )
}
