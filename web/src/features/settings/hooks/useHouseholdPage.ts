import { useMe } from '../../../app/useMe'
import { useToast } from '../../../ui'
import { errorMessage } from '../lib/errors'
import { browserTimeZone, needsTimeZoneSetup } from '../lib/timezone'
import { settingsStrings } from '../strings'
import type { SettingsInput } from '../types'
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

  return { isAdmin, household, suggestedTimeZone, save }
}
