import type { Preferences } from '../types'

export interface PreferencesState {
  /** The server's value, or the defaults while loading. */
  preferences: Preferences
  isPending: boolean
  save: (next: Preferences) => Promise<Preferences>
  saving: boolean
}

export function usePreferences(): PreferencesState {
  throw new Error('not implemented')
}
