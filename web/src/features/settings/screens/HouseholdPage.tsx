import { Tile } from '../../../ui'
import { HouseholdSettingsForm } from '../components/HouseholdSettingsForm'
import { SettingsHeader } from '../components/SettingsHeader'
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
          <p role={household.isError ? 'alert' : 'status'}>{household.isError ? settingsStrings.loadError : settingsStrings.loading}</p>
        )}
      </Tile>
    </div>
  )
}
