import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Tile } from '../../../ui'
import { notificationStrings as s } from '../strings'
import '../notifications.css'

/** A Tile linking to /settings/notifications, embedded in the Settings page. */
export function NotificationSettingsLink(): ReactElement {
  return (
    <Tile as="section" size="full" aria-label={s.linkLabel}>
      <h2 className="notifications__heading">
        <Link to="/settings/notifications">{s.linkLabel}</Link>
      </h2>
      <p className="notifications__muted">{s.linkHint}</p>
    </Tile>
  )
}
