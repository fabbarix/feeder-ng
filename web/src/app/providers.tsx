import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { PreferenceThemeProvider } from '../features/settings/components/PreferenceThemeProvider'
import { queryDefaults } from '../lib/dataState'
import { ConfirmProvider, ToastProvider } from '../ui'

/**
 * B9-20 (RES-02): the query layer follows the same connection as the shell. TanStack listens for `online`/`offline` only
 * while a client is mounted; this remembers the last event the page saw, so a client mounted later starts from it.
 */
let lastOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (lastOnline = true))
  window.addEventListener('offline', () => (lastOnline = false))
  onlineManager.setEventListener((setOnline) => {
    setOnline(lastOnline)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  })
}

/** B9-20 (RES-02, RES-06): the app's QueryClient: offlineFirst, one retry after 1 s for what a retry can fix, no mutation retry. */
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { ...queryDefaults.queries }, mutations: { ...queryDefaults.mutations } } })
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
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
