import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { usePlanLiveUpdates } from './usePlanLiveUpdates'

beforeEach(() => vi.stubGlobal('EventSource', class {}))
afterEach(() => vi.unstubAllGlobals())

describe('usePlanLiveUpdates', () => {
  it('refetches the plan and the zero-waste streak on a `plan` event (a Leftover discard moves the streak)', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => usePlanLiveUpdates(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
    sse.handlers['plan']?.()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plan'] }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['today', 'streak'] }))
  })
})
