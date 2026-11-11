// Test support for the Recipe Assistant settings tests. Re-exports the settings feature's routed fetch stub.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
export { ADMIN_ME, USER_ME, mockApi, newQueryClient, pickOption, renderWithProviders } from '../settings/test-utils'

/** A renderHook wrapper around a client the test holds, to inspect the query cache or remount. */
export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
