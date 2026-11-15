import { useMe } from '../../../app/useMe'
import { useToast } from '../../../ui'
import { errorMessage } from '../lib/errors'
import { browserTimeZone, needsTimeZoneSetup } from '../lib/timezone'
import { settingsStrings } from '../strings'
import type { HouseholdSettings, SettingsInput } from '../types'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'
import { useHouseholdSettings } from './useHouseholdSettings'

/** The Household page: the settings, the browser's zone while it was never set, and a save that says so. */
export function useHouseholdPage() {
  useHouseholdLiveUpdates()
  const toast = useToast()
  const isAdmin = Boolean(useMe().data?.isAdmin)
  const household = useHouseholdSettings()
  const suggestedTimeZone = household.settings && needsTimeZoneSetup(household.settings, isAdmin) ? browserTimeZone() : undefined

  const save = async (input: SettingsInput) => {
    try {
      await household.save(input)
      toast.show(settingsStrings.householdSaved, { status: 'success' })
    } catch (err) {
      toast.show(errorMessage(err), { status: 'error' })
    }
  }

  /** B9-53 (TB 6): shows the hidden first-run checklist on Today again; the rest of the settings go back as they are. */
  const showSetup = async () => {
    const current = household.settings
    if (!current) return
    const { timeZoneConfigured: _owned, ...rest }: HouseholdSettings = current
    try {
      await household.save({ ...rest, setupHidden: false })
      toast.show(settingsStrings.form.setupShown)
    } catch (err) {
      toast.show(errorMessage(err), { status: 'warning' })
    }
  }

  return { isAdmin, household, suggestedTimeZone, save, showSetup }
}
