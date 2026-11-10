import type { ReactNode } from 'react'
import { ThemeProvider } from '../../../theme/ThemeProvider'
import { usePreferenceTheme } from '../hooks/usePreferenceTheme'

/** ThemeProvider fed by usePreferenceTheme(): the signed-in User's accent and mode. */
export function PreferenceThemeProvider({ children }: { children: ReactNode }) {
  const theme = usePreferenceTheme()
  return (
    <ThemeProvider accent={theme.accent} scheme={theme.scheme}>
      {children}
    </ThemeProvider>
  )
}
