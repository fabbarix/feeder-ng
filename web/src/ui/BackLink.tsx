import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { uiStrings } from './strings'
import './BackLink.css'

export interface BackLinkProps {
  /** Where back goes (a path). */
  to: string
  /** The destination's name ("Settings"): shown next to the arrow, announced as "Back to Settings". */
  label: string
}

/** The one back control of a sub-page: arrow and destination name, no underline. */
export function BackLink({ to, label }: BackLinkProps) {
  return (
    <Link className="back-link" to={to} aria-label={uiStrings.backTo(label)}>
      <Icon name="back" size={20} />
      <span>{label}</span>
    </Link>
  )
}
