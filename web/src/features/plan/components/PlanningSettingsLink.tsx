import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Tile } from '../../../ui'
import { planStrings } from '../strings'
import '../plan.css'

/** A Tile linking to /settings/planning, embedded in the Settings page. */
export function PlanningSettingsLink(): ReactNode {
  return (
    <Tile as="section" span="full" aria-label={planStrings.rulesTitle}>
      <h2 className="plan__tile-title">
        <Link to="/settings/planning">{planStrings.rulesTitle}</Link>
      </h2>
      <p className="plan__muted">{planStrings.rulesLinkHint}</p>
    </Tile>
  )
}
