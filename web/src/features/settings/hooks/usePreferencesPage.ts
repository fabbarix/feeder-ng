import { useToast } from '../../../ui'
import { errorMessage } from '../lib/errors'
import { settingsStrings } from '../strings'
import type { Preferences } from '../types'
import { usePreferences } from './usePreferences'

/** Your preferences: the User's own scheme, units and accent. */
export function usePreferencesPage() {
  const toast = useToast()
  const preferences = usePreferences()

  const save = async (next: Preferences) => {
    try {
      await preferences.save(next)
      toast.show(settingsStrings.preferencesSaved, { status: 'success' })
    } catch (err) {
      toast.show(errorMessage(err), { status: 'error' })
    }
  }

  return { preferences, save }
}
