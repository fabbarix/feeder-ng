import { Skeleton, Tile } from '../../../ui'
import { PreferencesForm } from '../components/PreferencesForm'
import { SettingsHeader } from '../components/SettingsHeader'
import { SettingsLoadGate } from '../components/SettingsLoadGate'
import { usePreferencesLeaveGuard, usePreferencesPage } from '../hooks/usePreferencesPage'
import { settingsStrings } from '../strings'
import '../settings.css'

type Page = ReturnType<typeof usePreferencesPage>

/** /settings/preferences: the signed-in User's own colour mode, units and accent, previewed across the app until saved. */
export function PreferencesPage() {
  const page = usePreferencesPage()
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.preferences} />
      <SettingsLoadGate state={page.preferences.state} onRetry={page.preferences.refetch}>
        {page.preferences.state === 'loading' ? (
          <Tile as="section" span="full" aria-label={settingsStrings.preferences}>
            <Skeleton variant="line" count={4} label={settingsStrings.loading} />
          </Tile>
        ) : (
          <PreferencesEditor page={page} />
        )}
      </SettingsLoadGate>
    </div>
  )
}

/** The loaded form, with the "Leave without saving?" guard (a preview exists only once the preferences are loaded). */
function PreferencesEditor({ page }: { page: Page }) {
  const prefs = page.preferences
  usePreferencesLeaveGuard(prefs)
  return (
    <PreferencesForm
      label={settingsStrings.preferences}
      value={prefs.effective}
      saved={prefs.saved}
      dirty={prefs.dirty}
      saving={prefs.saving}
      onChange={page.change}
      onRevert={page.revert}
      onSave={page.save}
    />
  )
}
