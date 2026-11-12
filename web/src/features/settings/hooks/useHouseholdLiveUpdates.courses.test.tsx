// CRS D2: a `courses` household event (an import, another User's Courses write) refreshes the Courses and the Meal Slots.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (data: unknown) => void
const topics = new Map<string, Handler>()
const reconnects: Array<() => void> = []

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({
    subscribe: (topic: string, handler: Handler) => {
      topics.set(topic, handler)
      return () => topics.delete(topic)
    },
    onReconnect: (cb: () => void) => {
      reconnects.push(cb)
      return () => reconnects.splice(reconnects.indexOf(cb), 1)
    },
    close: vi.fn(),
  }),
}))

import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  renderHook(() => useHouseholdLiveUpdates(), { wrapper })
  return () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
}

describe('useHouseholdLiveUpdates and Courses', () => {
  beforeEach(() => {
    topics.clear()
    reconnects.length = 0
    vi.stubGlobal('EventSource', class {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('a "courses" change invalidates the Courses query and the Meal Slots', () => {
    const invalidated = setup()
    topics.get('household')?.({ changed: 'courses' })
    expect(invalidated()).toEqual(expect.arrayContaining([['courses'], ['household', 'meal-slots']]))
  })

  it('a reconnect refetches the Courses as well', () => {
    const invalidated = setup()
    reconnects[0]?.()
    expect(invalidated()).toEqual(expect.arrayContaining([['household'], ['allowlist'], ['courses']]))
  })
})
