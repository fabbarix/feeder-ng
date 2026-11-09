import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ToastProvider } from '../ui'

/** The default accent. Each household's choice will replace it once settings exist. */
export const DEFAULT_ACCENT = '#3f7d58'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider accent={DEFAULT_ACCENT} scheme="system">
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
