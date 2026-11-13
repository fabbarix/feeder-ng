// B5-F1: a Meal Slot changed on one date (household event `slotDates`) refetches the plan on every device.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sse = vi.hoisted(() => {
  const handlers: Record<string, (data?: unknown) => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: (data?: unknown) => void) => {
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

describe('usePlanLiveUpdates: slotDates', () => {
  it('refetches the plan on a household event {"changed":"slotDates"}', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => usePlanLiveUpdates(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
    sse.handlers['household']?.({ changed: 'slotDates' })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plan'] }))
  })
})
