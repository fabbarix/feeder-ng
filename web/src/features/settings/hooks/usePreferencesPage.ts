import { failureToast, saveFailed } from '../../../lib/errorCopy'
import { useToast } from '../../../ui'
import { settingsStrings } from '../strings'
import type { Preferences } from '../types'
import { usePreferences } from './usePreferences'

/** The thing a failed save names (RES-06), in GLOSSARY words. */
const WHAT = 'your preferences'

/** Your preferences: the User's own scheme, units and accent. */
export function usePreferencesPage() {
  const toast = useToast()
  const preferences = usePreferences()

  // B9-20 (RES-06): one failure, one toast, from here (the mutation hook never toasts). It names what failed and its
  // Try again runs the same save; offline it says so and offers none.
  const save = async (next: Preferences): Promise<void> => {
    try {
      await preferences.save(next)
      toast.show(settingsStrings.preferencesSaved, { status: 'success' })
    } catch (err) {
      toast.show(failureToast(saveFailed(WHAT, err), () => void save(next)))
    }
  }

  return { preferences, save }
}
