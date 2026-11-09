import type { ReactNode } from 'react'
import { ThemeProvider } from '../../../theme/ThemeProvider'
import { usePreferenceTheme } from '../hooks/usePreferenceTheme'

/** ThemeProvider fed by usePreferenceTheme(): the signed-in User's accent, secondary colour and mode. */
export function PreferenceThemeProvider({ children }: { children: ReactNode }) {
  const theme = usePreferenceTheme()
  return (
    <ThemeProvider accent={theme.accent} secondary={theme.secondary} scheme={theme.scheme}>
      {children}
    </ThemeProvider>
  )
}
