// B9-20: shared harness for the "unknown is not empty" and "errors in about 1 s" screen tests. Test support only.
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { createQueryClient } from '../app/providers'
import { ApiError } from '../lib/http'
import { ConfirmProvider, ToastProvider } from '../ui'

/** The phone has no signal: onLine is false, the offline event fired, and every request fails the way fetch does. */
export function goOffline(): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  window.dispatchEvent(new Event('offline'))
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
}

export function comeBack(answer: (url: string) => unknown): void {
  vi.mocked(navigator, { partial: true })
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(answer(String(url))), { status: 200 }))))
  window.dispatchEvent(new Event('online'))
}

/** Online, and every /api request answers with `status` (default 500). */
export function serverDown(status = 500): ReturnType<typeof vi.fn> {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'internal', message: 'boom' } }), { status })))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

export function mountScreen(element: ReactNode, path: string, route = path) {
  const client = createQueryClient()
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={route} element={element} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { client, ...utils }
}

export const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
export { ApiError }
