import { Muted, Tile } from '../../../ui'
import { AllowlistPanel } from '../components/AllowlistPanel'
import { SettingsHeader } from '../components/SettingsHeader'
import { SettingsLoadGate } from '../components/SettingsLoadGate'
import { useAllowlistPage } from '../hooks/useAllowlistPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/allowlist: who may sign in. Admins only; a plain User is told so and nothing is fetched. */
export function AllowlistPage() {
  const page = useAllowlistPage()
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.allowlist} />
      <SettingsLoadGate state={page.isAdmin ? page.allowlist.state : 'ready'} onRetry={page.allowlist.refetch}>
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
            <Muted>{settingsStrings.allowlistAdminOnly}</Muted>
          )}
        </Tile>
      </SettingsLoadGate>
    </div>
  )
}
