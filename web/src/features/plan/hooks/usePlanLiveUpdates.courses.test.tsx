// CRS F: Courses are household data (topic `household`, changed courses / mealSlots / attendance): the plan shows their
// names, order and who eats them, so those events refetch it. Other household changes do not.
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
const planCalls = (spy: ReturnType<typeof setup>) => spy.mock.calls.filter(([f]) => JSON.stringify((f as { queryKey?: unknown }).queryKey) === JSON.stringify(['plan']))

describe('usePlanLiveUpdates and Courses', () => {
  it.each(['courses', 'mealSlots', 'attendance'])('refetches the plan when the household changes `%s`', (changed) => {
    const spy = setup()
    sse.handlers['household']?.({ changed })
    expect(planCalls(spy)).toHaveLength(1)
  })

  it.each(['settings', 'members', 'nonsense'])('ignores a household change of `%s`', (changed) => {
    const spy = setup()
    sse.handlers['household']?.({ changed })
    expect(planCalls(spy)).toHaveLength(0)
  })

  it('ignores a household event without a payload', () => {
    const spy = setup()
    sse.handlers['household']?.(undefined)
    expect(planCalls(spy)).toHaveLength(0)
  })

  it('still refetches on a `plan` event', () => {
    const spy = setup()
    sse.handlers['plan']?.()
    expect(planCalls(spy)).toHaveLength(1)
  })
})
