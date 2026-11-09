import { useMe } from '../../../app/useMe'
import { DEFAULT_PREFERENCES } from '../lib/defaults'
import type { ColourMode } from '../types'
import { usePreferences } from './usePreferences'

export interface PreferenceTheme {
  accent: string
  secondary?: string
  scheme: ColourMode
}

/** The theme inputs for ThemeProvider: the signed-in User's preferences, or the defaults while
 *  signed out or loading (and then without fetching preferences). */
export function usePreferenceTheme(): PreferenceTheme {
  const me = useMe()
  const { preferences } = usePreferences(Boolean(me.data))
  const p = me.data ? preferences : DEFAULT_PREFERENCES
  return { accent: p.accent, secondary: p.secondary ?? undefined, scheme: p.scheme }
}
