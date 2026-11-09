import type { Preferences } from '../types'

/** Used while signed out or loading. Matches the server's defaults. */
export const DEFAULT_PREFERENCES: Preferences = { scheme: 'system', accent: '#3f7d58', secondary: null, units: 'metric' }
