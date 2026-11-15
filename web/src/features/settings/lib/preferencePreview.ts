// B9-36 (SAFE-08, decision SAFE 6 B): the unsaved preview of Your preferences. Plain TypeScript, no React. STUB: the developer writes
// the bodies (lib/preferencePreview.test.ts).
import type { Preferences } from '../types'

export interface PreferencePreview {
  /** The previewed preferences, or null when nothing is previewed. */
  get: () => Preferences | null
  /** Previews `next` across the whole app. */
  set: (next: Preferences) => void
  /** Ends the preview: every consumer falls back to the saved value. */
  clear: () => void
  /** Called after every change of the preview. Returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
  /** The page that owns a dirty preview registers its leave check (useLeaveGuard's confirmLeave); null unregisters. */
  setLeaveCheck: (check: (() => Promise<boolean>) | null) => void
  /** For an exit that is not a router navigation (Sign out): true at once with no check registered, else the check's answer. */
  confirmLeave: () => Promise<boolean>
}

export function createPreferencePreview(): PreferencePreview {
  throw new Error('not implemented: createPreferencePreview')
}

/** The app's one preview. */
export const preferencePreview: PreferencePreview = {
  get: () => null,
  set: () => {
    throw new Error('not implemented: preferencePreview.set')
  },
  // The no-ops let a test's cleanup run; the stub still previews nothing.
  clear: () => {},
  subscribe: () => () => {},
  setLeaveCheck: () => {},
  confirmLeave: () => {
    throw new Error('not implemented: preferencePreview.confirmLeave')
  },
}

/** The status line of a dirty form ("Not saved yet: Dark is a preview. Save it or put back System."), or null when nothing differs. */
export function previewSummary(_saved: Preferences, _preview: Preferences): string | null {
  throw new Error('not implemented: previewSummary')
}
