import { Tile } from '../../../ui'
import { PreferencesForm } from '../components/PreferencesForm'
import { SettingsHeader } from '../components/SettingsHeader'
import { usePreferencesPage } from '../hooks/usePreferencesPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/preferences: the signed-in User's own colour mode, units and accent. */
export function PreferencesPage() {
  const page = usePreferencesPage()
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.preferences} />
      <Tile as="section" span="full" aria-label={settingsStrings.preferences}>
        <PreferencesForm
          key={JSON.stringify(page.preferences.preferences)}
          value={page.preferences.preferences}
          saving={page.preferences.saving}
          onSave={page.save}
        />
      </Tile>
    </div>
  )
}
