import { Tile } from '../../../ui'
import { AllowlistPanel } from '../components/AllowlistPanel'
import { SettingsHeader } from '../components/SettingsHeader'
import { useAllowlistPage } from '../hooks/useAllowlistPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/allowlist: who may sign in. Admins only; a plain User is told so and nothing is fetched. */
export function AllowlistPage() {
  const page = useAllowlistPage()
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.allowlist} />
      <Tile as="section" span="full" aria-label={settingsStrings.allowlist}>
        {page.isAdmin ? (
          <AllowlistPanel
            users={page.allowlist.users}
            currentUserId={page.currentUserId}
            error={page.error}
            addError={page.addError}
            onEmailEdit={page.clearAddError}
            onAdd={page.add}
            onSetAdmin={page.setAdmin}
            onRemove={page.remove}
          />
        ) : (
          <p className="settings__muted">{settingsStrings.allowlistAdminOnly}</p>
        )}
      </Tile>
    </div>
  )
}
