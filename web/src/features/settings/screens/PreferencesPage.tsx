import { PreferencesForm } from '../components/PreferencesForm'
import { SettingsHeader } from '../components/SettingsHeader'
import { SettingsLoadGate } from '../components/SettingsLoadGate'
import { usePreferencesLeaveGuard, usePreferencesPage } from '../hooks/usePreferencesPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/preferences: the signed-in User's own colour mode, units and accent, previewed across the app until saved. */
export function PreferencesPage() {
  const page = usePreferencesPage()
  const prefs = page.preferences
  usePreferencesLeaveGuard(prefs)
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.preferences} />
      <SettingsLoadGate state={prefs.state} onRetry={prefs.refetch}>
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
      </SettingsLoadGate>
    </div>
  )
}
