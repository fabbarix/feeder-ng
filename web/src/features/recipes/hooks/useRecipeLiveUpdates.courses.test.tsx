// CRS E2: a household `courses` change (another User renames, adds or archives a Course, or an import adds one) refreshes the Recipe screens.
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

import { useRecipeLiveUpdates } from './useRecipeLiveUpdates'

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  renderHook(() => useRecipeLiveUpdates(), { wrapper })
  return () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
}

beforeEach(() => {
  topics.clear()
  reconnects.length = 0
  vi.stubGlobal('EventSource', class {})
})
afterEach(() => vi.unstubAllGlobals())

describe('useRecipeLiveUpdates and Courses', () => {
  it('a household "courses" change refreshes the Courses and the Recipes (their chips name the Courses)', () => {
    const invalidated = setup()
    topics.get('household')?.({ changed: 'courses' })
    expect(invalidated()).toEqual(expect.arrayContaining([['courses'], ['recipes']]))
  })
  it('ignores the other household changes', () => {
    const invalidated = setup()
    topics.get('household')?.({ changed: 'members' })
    topics.get('household')?.('nonsense')
    expect(invalidated()).toEqual([])
  })
  it('still refreshes Recipes, Tags and preferences on a recipes event (an archived Course sends {"changed":"courses"} there)', () => {
    const invalidated = setup()
    topics.get('recipes')?.({ changed: 'courses' })
    expect(invalidated()).toEqual(expect.arrayContaining([['recipes'], ['tags'], ['recipe-preferences'], ['courses']]))
  })
  it('a reconnect refreshes the Courses as well', () => {
    const invalidated = setup()
    reconnects.forEach((cb) => cb())
    expect(invalidated()).toEqual(expect.arrayContaining([['courses'], ['recipes']]))
  })
})
