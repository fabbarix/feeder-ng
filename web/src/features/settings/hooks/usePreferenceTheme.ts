import type { ColourMode } from '../types'

export interface PreferenceTheme {
  accent: string
  secondary?: string
  scheme: ColourMode
}

/** The theme inputs for ThemeProvider: the signed-in User's preferences, or the defaults while
 *  signed out or loading (and then without fetching preferences). */
export function usePreferenceTheme(): PreferenceTheme {
  throw new Error('not implemented')
}
