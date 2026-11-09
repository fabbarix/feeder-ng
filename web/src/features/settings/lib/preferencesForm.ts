import type { Preferences } from '../types'

/** What "Use a secondary colour" starts from. */
export const DEFAULT_SECONDARY = '#ffb4a2'

/** True when the draft differs from the saved preferences. */
export function preferencesChanged(saved: Preferences, draft: Preferences): boolean {
  return (
    saved.scheme !== draft.scheme ||
    saved.units !== draft.units ||
    saved.accent.toLowerCase() !== draft.accent.toLowerCase() ||
    (saved.secondary?.toLowerCase() ?? null) !== (draft.secondary?.toLowerCase() ?? null)
  )
}
