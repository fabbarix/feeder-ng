import type { ReactElement } from 'react'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { PageHeader, Tile } from '../../../ui'
import { useNotificationSettings } from '../hooks/useNotificationSettings'
import { notificationStrings as s } from '../strings'
import { NotificationSettingsView } from './NotificationSettingsView'
import '../notifications.css'

/**
 * The /settings/notifications route: heading "Notifications", then
 * useNotificationSettings() -> NotificationSettingsView in a Tile; "Loading" while loading and
 * the load-error text on error.
 */
export function NotificationSettingsScreen(): ReactElement {
  const state = useNotificationSettings()
  const breadcrumbs = useBreadcrumbs()
  return (
    <main className="notifications">
      <PageHeader title={s.title} breadcrumbs={breadcrumbs} />
      {state.loading ? (
        <Tile as="section" span="full">
          <p className="notifications__muted">{s.loading}</p>
        </Tile>
      ) : state.error ? (
        <Tile as="section" span="full">
          <p role="alert">{s.loadError}</p>
        </Tile>
      ) : (
        <NotificationSettingsView
          support={state.support}
          quietHours={state.config?.quietHours}
          thisDevice={state.thisDevice}
          otherDevices={state.otherDevices}
          busy={state.busy}
          onEnable={() => void state.enable()}
          onDisable={() => void state.disable()}
          onSetType={(id, type, on) => void state.setType(id, type, on)}
          onRemove={(id) => void state.removeDevice(id)}
        />
      )}
    </main>
  )
}
