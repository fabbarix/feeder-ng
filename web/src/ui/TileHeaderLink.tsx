import { Link, useInRouterContext } from 'react-router-dom'
import { Icon } from './Icon'
import './TileHeaderLink.css'

export interface TileHeaderLinkProps {
  /** An in-app path ("/pantry?status=useSoon"). */
  to: string
  /** The visible text, "Pantry". */
  label: string
  /** What the link opens there, for its accessible name: "Pantry, Use soon". */
  context: string
}

/**
 * B9-44 (TB-09): the trailing link of a TileHeader ("Pantry ›"). It navigates rather than acts, so it stays a link and reads as one
 * (R-A allows it): underlined text with a caret, a 44 px target, no button fill. Named with its target ("Pantry, Use soon").
 */
export function TileHeaderLink({ to, label, context }: TileHeaderLinkProps) {
  const inRouter = useInRouterContext()
  const name = `${label}, ${context}`
  const body = (
    <>
      <span className="tile-header__link-text">{label}</span>
      <Icon name="chevron" size={16} />
    </>
  )
  // Outside a router (a tile rendered on its own) it is a plain link to the same address.
  return inRouter ? (
    <Link className="tile-header__link" to={to} aria-label={name}>
      {body}
    </Link>
  ) : (
    <a className="tile-header__link" href={to} aria-label={name}>
      {body}
    </a>
  )
}
