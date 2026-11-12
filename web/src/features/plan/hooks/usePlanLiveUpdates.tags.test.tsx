// SF-chips: a Tag renamed on another device (SSE topic `tags`) refreshes ['tags'], so the Plan's chips show the new name.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sse = vi.hoisted(() => {
  const handlers: Record<string, (data?: unknown) => void> = {}
  const reconnect: (() => void)[] = []
  const connection = {
    subscribe: vi.fn((topic: string, handler: (data?: unknown) => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn((cb: () => void) => {
      reconnect.push(cb)
      return vi.fn()
    }),
    close: vi.fn(),
  }
  return { handlers, reconnect, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { usePlanLiveUpdates } from './usePlanLiveUpdates'

beforeEach(() => vi.stubGlobal('EventSource', class {}))
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  renderHook(() => usePlanLiveUpdates(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  return spy
}

const tagCalls = (spy: ReturnType<typeof setup>) => spy.mock.calls.filter(([f]) => JSON.stringify((f as { queryKey?: unknown }).queryKey) === JSON.stringify(['tags']))

describe('usePlanLiveUpdates and Tags', () => {
  it('invalidates [tags] when the server publishes on `tags`', () => {
    const spy = setup()
    expect(sse.connectEvents).toHaveBeenCalled()
    sse.handlers['tags']?.()
    expect(tagCalls(spy)).toHaveLength(1)
  })
})
