import { useEffect } from 'react'
import { failureToast, saveFailed } from '../../../lib/errorCopy'
import { useLeaveGuard, useToast } from '../../../ui'
import { preferencePreview, previewLeaveCopy } from '../lib/preferencePreview'
import { settingsStrings } from '../strings'
import type { Preferences } from '../types'
import { usePreferences, type PreferencesState } from './usePreferences'

/** The thing a failed save names (RES-06), in GLOSSARY words. */
const WHAT = 'your preferences'

/**
 * Your preferences: the User's own scheme, units and accent. B9-36 (SAFE-08): each choice is previewed across the app at once
 * (lib/preferencePreview); Save PUTs it, Revert drops the preview. Leaving the page ends the preview.
 */
export function usePreferencesPage() {
  const toast = useToast()
  const preferences = usePreferences()

  // B9-20 (RES-06): one failure, one toast, from here (the mutation hook never toasts). It names what failed and its
  // Try again runs the same save; offline it says so and offers none. A failed save keeps the preview.
  const save = async (next: Preferences): Promise<void> => {
    try {
      await preferences.save(next)
      toast.show(settingsStrings.preferencesSaved, { status: 'success' })
    } catch (err) {
      toast.show(failureToast(saveFailed(WHAT, err), () => void save(next)))
    }
  }

  /** A choice: previewed across the app at once, never sent. */
  const change = (next: Preferences) => preferencePreview.set(next)
  /** Puts the saved values back at once. */
  const revert = () => preferencePreview.clear()

  // The preview lives only while this page is open: leaving it (after the guard's Discard changes, or a Save) ends it.
  useEffect(() => () => preferencePreview.clear(), [])

  return { preferences, save, change, revert }
}

/**
 * B9-36 (SAFE R2, decision SAFE 6): "Leave without saving?" while a preview is on, for router exits and, through the preview store's
 * leave check, for Sign out. The body names what is previewed and what comes back. Needs a data router.
 */
export function usePreferencesLeaveGuard(preferences: Pick<PreferencesState, 'dirty' | 'saved' | 'effective'>) {
  const copy = preferences.dirty ? previewLeaveCopy(preferences.saved, preferences.effective) : null
  const guard = useLeaveGuard(preferences.dirty, { what: WHAT, onDiscard: () => preferencePreview.clear(), lead: copy?.lead, note: copy?.note })
  useEffect(() => {
    preferencePreview.setLeaveCheck(guard.confirmLeave)
    return () => preferencePreview.setLeaveCheck(null)
  }, [guard])
  return guard
}
