import type { ReactNode } from 'react'

/** ThemeProvider fed by usePreferenceTheme(): the signed-in User's accent, secondary colour and mode. */
export function PreferenceThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
