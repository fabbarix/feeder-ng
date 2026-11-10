import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { PreferenceThemeProvider } from '../features/settings/components/PreferenceThemeProvider'
import { ConfirmProvider, ToastProvider } from '../ui'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <PreferenceThemeProvider>
        <ConfirmProvider>
          <ToastProvider>{children}</ToastProvider>
        </ConfirmProvider>
      </PreferenceThemeProvider>
    </QueryClientProvider>
  )
}
