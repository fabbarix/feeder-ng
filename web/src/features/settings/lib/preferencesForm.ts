import type { Preferences } from '../types'

/** True when the draft differs from the saved preferences. */
export function preferencesChanged(saved: Preferences, draft: Preferences): boolean {
  return (
    saved.scheme !== draft.scheme ||
    saved.units !== draft.units ||
    saved.accent.toLowerCase() !== draft.accent.toLowerCase()
  )
}
