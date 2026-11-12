// CRS E2: the Courses an Import Review row can be answered with (docs/dev/design/crs-e2.md 4.4).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices } from '../../recipes/fixtures.test-helper'

type Handler = (data: unknown) => void
const h = vi.hoisted(() => ({ topics: new Map<string, Handler>(), reconnects: [] as Array<() => void>, me: { id: 1, isAdmin: true } as { id: number; isAdmin: boolean } | null, pending: false }))
vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({
    subscribe: (topic: string, handler: Handler) => {
      h.topics.set(topic, handler)
      return () => h.topics.delete(topic)
    },
    onReconnect: (cb: () => void) => {
      h.reconnects.push(cb)
      return () => h.reconnects.splice(h.reconnects.indexOf(cb), 1)
    },
    close: vi.fn(),
  }),
}))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: courseChoices, isPending: h.pending, isError: false }) }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: h.me, isLoading: false }) }))

import { useImportCourses } from './useImportCourses'

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useImportCourses(), { wrapper })
  return { ...hook, invalidated: () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey) }
}

beforeEach(() => {
  h.topics.clear()
  h.reconnects.length = 0
  h.me = { id: 1, isAdmin: true }
  h.pending = false
  vi.stubGlobal('EventSource', class {})
})
afterEach(() => vi.unstubAllGlobals())

describe('useImportCourses', () => {
  it('answers the active Courses in household order', () => {
    expect(setup().result.current.courses).toEqual(courseChoices)
  })
  it('says whether the signed-in User is an Admin', () => {
    expect(setup().result.current.isAdmin).toBe(true)
    h.me = { id: 2, isAdmin: false }
    expect(setup().result.current.isAdmin).toBe(false)
    h.me = null
    expect(setup().result.current.isAdmin).toBe(false)
  })
  it('passes on that the Courses are still loading', () => {
    h.pending = true
    expect(setup().result.current.isPending).toBe(true)
  })
  it('refetches the Courses on a household "courses" change and on a reconnect', () => {
    const { invalidated } = setup()
    h.topics.get('household')?.({ changed: 'courses' })
    expect(invalidated()).toContainEqual(['courses'])
    const before = invalidated().length
    h.reconnects.forEach((cb) => cb())
    expect(invalidated().length).toBeGreaterThan(before)
  })
  it('ignores the other household changes', () => {
    const { invalidated } = setup()
    h.topics.get('household')?.({ changed: 'members' })
    expect(invalidated()).toEqual([])
  })
})
