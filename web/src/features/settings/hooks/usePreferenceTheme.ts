import { useEffect, useState } from 'react'
import { useMe } from '../../../app/useMe'
import { buildThemeCache, readThemeCache, writeThemeCache } from '../../../theme/themeCache'
import { DEFAULT_PREFERENCES } from '../lib/defaults'
import type { ColourMode } from '../types'
import { usePreferences } from './usePreferences'

export interface PreferenceTheme {
  accent: string
  scheme: ColourMode
}

/** The theme inputs for ThemeProvider: the signed-in User's preferences, or the defaults while
 *  signed out (and then without fetching preferences). B9-49 (RES-08): while a remembered User's preferences load, the theme
 *  kept on the device; the saved preferences (never a preview) are written back to it. */
export function usePreferenceTheme(): PreferenceTheme {
  const me = useMe()
  const signedIn = Boolean(me.data)
  const prefs = usePreferences(signedIn)
  const [cached] = useState(readThemeCache)
  const hasSaved = prefs.state === 'ready' || prefs.state === 'offlineSaved'
  const { scheme: savedScheme, accent: savedAccent } = prefs.saved

  useEffect(() => {
    if (signedIn && hasSaved) writeThemeCache(buildThemeCache({ scheme: savedScheme, accent: savedAccent }))
  }, [signedIn, hasSaved, savedScheme, savedAccent])

  if (!signedIn) return { accent: DEFAULT_PREFERENCES.accent, scheme: DEFAULT_PREFERENCES.scheme }
  if (!hasSaved && cached && !prefs.dirty) return { accent: cached.accent, scheme: cached.scheme }
  return { accent: prefs.effective.accent, scheme: prefs.effective.scheme }
}
