// Test support for Settings > Tags: the settings fetch stub, plus a provider wrapper that exposes its QueryClient.
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ConfirmProvider, ToastProvider } from '../../ui'
import { newQueryClient } from '../settings/test-utils'

export { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../settings/test-utils'

/** A fresh QueryClient and the wrapper that uses it (Query, Toast, Confirm and Router), for renderHook. */
export function tagsHarness() {
  const client = newQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter>{children}</MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
  return { client, wrapper }
}

export const TAG_KEYS = [['tags'], ['slot-rules'], ['variety-rules'], ['plan', 'tags']]
