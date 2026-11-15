import { Tile } from '../../../ui'
import { HouseholdSettingsForm } from '../components/HouseholdSettingsForm'
import { SettingsHeader } from '../components/SettingsHeader'
import { SettingsLoadGate } from '../components/SettingsLoadGate'
import { useHouseholdPage } from '../hooks/useHouseholdPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/household: the Household settings form (read-only for a plain User). */
export function HouseholdPage() {
  const page = useHouseholdPage()
  const { household } = page
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.household} />
      <SettingsLoadGate state={household.state} onRetry={household.refetch}>
        <Tile as="section" span="full" aria-label={settingsStrings.household}>
          {household.settings ? (
            <HouseholdSettingsForm
              key={JSON.stringify(household.settings)}
              value={household.settings}
              canEdit={page.isAdmin}
              saving={household.saving}
              suggestedTimeZone={page.suggestedTimeZone}
              onSave={page.save}
            />
          ) : (
            <p role="status">{settingsStrings.loading}</p>
          )}
        </Tile>
      </SettingsLoadGate>
    </div>
  )
}
