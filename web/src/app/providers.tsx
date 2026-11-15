import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { PreferenceThemeProvider } from '../features/settings/components/PreferenceThemeProvider'
import { ConfirmProvider, ToastProvider } from '../ui'

/** B9-20 (RES-02, RES-06): the app's QueryClient with the query policy. STUB: the developer builds it. */
export function createQueryClient(): QueryClient {
  return new QueryClient()
}

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
