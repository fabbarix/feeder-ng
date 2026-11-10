import { Link } from 'react-router-dom'

export interface BackLinkProps {
  /** Where back goes (a path). */
  to: string
  /** The destination's name ("Settings"): shown next to the arrow, announced as "Back to Settings". */
  label: string
}

// R11a stub: the developer implements it (design note docs/dev/design/r11a-settings-shell.md, "Back control").
export function BackLink({ to, label }: BackLinkProps) {
  return <Link to={to}>{label}</Link>
}
