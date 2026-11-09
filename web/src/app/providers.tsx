import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { PreferenceThemeProvider } from '../features/settings/components/PreferenceThemeProvider'
import { ToastProvider } from '../ui'

/** The default accent, used while signed out. A signed-in User's own choice replaces it. */
export const DEFAULT_ACCENT = '#3f7d58'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <PreferenceThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </PreferenceThemeProvider>
    </QueryClientProvider>
  )
}
