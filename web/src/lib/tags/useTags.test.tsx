// useTags, useTagLookup and invalidateTagCaches (spec 17: a Tag write and a `tags` event make four caches stale).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tag } from './types'

type Handler = (data: unknown) => void
const sse = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  reconnect: [] as (() => void)[],
  closed: 0,
  unsubscribed: 0,
}))
vi.mock('../sse', () => ({
  connectEvents: () => ({
    subscribe: (topic: string, h: Handler) => {
      sse.handlers.set(topic, [...(sse.handlers.get(topic) ?? []), h])
      return () => {
        sse.unsubscribed++
      }
    },
    onReconnect: (cb: () => void) => {
      sse.reconnect.push(cb)
      return () => {}
    },
    close: () => {
      sse.closed++
    },
  }),
}))

import { invalidateTagCaches, TAG_CACHE_KEYS, useTagLookup, useTags } from './useTags'

const tag = (id: number, name: string, key = name.toLowerCase()): Tag => ({ id, name, key, colour: 'sage', recipes: 1, slotRules: 0, varietyRule: false })

beforeEach(() => {
  sse.handlers.clear()
  sse.reconnect.length = 0
  sse.closed = 0
  sse.unsubscribed = 0
  vi.stubGlobal('EventSource', class {})
})
afterEach(() => vi.unstubAllGlobals())

function setup(tags: Tag[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(tags), { status: 200 })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

const EXPECTED_KEYS = [['tags'], ['slot-rules'], ['variety-rules'], ['plan', 'tags']]

describe('invalidateTagCaches', () => {
  it('invalidates exactly the four keys', async () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    await invalidateTagCaches(client)
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual(EXPECTED_KEYS)
  })
  it('TAG_CACHE_KEYS lists the same four', () => expect(TAG_CACHE_KEYS).toEqual(EXPECTED_KEYS))
})

describe('useTags', () => {
  it('loads GET /api/tags and orders by name', async () => {
    const { wrapper } = setup([tag(1, 'pasta'), tag(2, 'Fish'), tag(3, 'Roast')])
    const { result } = renderHook(() => useTags(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.tags).toHaveLength(3))
    expect(result.current.tags.map((t) => t.name)).toEqual(['Fish', 'pasta', 'Roast'])
    expect(result.current.isLoading).toBe(false)
  })
  it('shares the cache key ["tags"] with the recipes feature', async () => {
    const { client, wrapper } = setup([tag(1, 'Fish')])
    renderHook(() => useTags(), { wrapper })
    await waitFor(() => expect(client.getQueryData(['tags'])).toBeDefined())
  })
  it('a `tags` event invalidates the four keys', async () => {
    const { client, wrapper } = setup([tag(1, 'Fish')])
    const spy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useTags(), { wrapper })
    await waitFor(() => expect(sse.handlers.get('tags')).toHaveLength(1))
    act(() => sse.handlers.get('tags')![0]!({}))
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual(expect.arrayContaining(EXPECTED_KEYS))
  })
  it('a reconnect refreshes the same caches', async () => {
    const { client, wrapper } = setup([tag(1, 'Fish')])
    const spy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useTags(), { wrapper })
    await waitFor(() => expect(sse.reconnect).toHaveLength(1))
    act(() => sse.reconnect[0]!())
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual(expect.arrayContaining(EXPECTED_KEYS))
  })
  it('unsubscribes and releases the stream on unmount', async () => {
    const { wrapper } = setup([tag(1, 'Fish')])
    const { unmount } = renderHook(() => useTags(), { wrapper })
    await waitFor(() => expect(sse.handlers.get('tags')).toHaveLength(1))
    unmount()
    expect(sse.unsubscribed).toBeGreaterThan(0)
    expect(sse.closed).toBe(1)
  })
  it('does nothing about events where there is no EventSource', async () => {
    vi.stubGlobal('EventSource', undefined)
    const { wrapper } = setup([tag(1, 'Fish')])
    const { result } = renderHook(() => useTags(), { wrapper })
    await waitFor(() => expect(result.current.tags).toHaveLength(1))
    expect(sse.handlers.size).toBe(0)
  })
})

describe('useTagLookup', () => {
  it('finds a Tag by name or key, by tagKey: case, spacing, and spelling of the same key', async () => {
    const { wrapper } = setup([tag(1, 'Fish Pie', 'fish pie'), tag(2, 'Soup')])
    const { result } = renderHook(() => useTagLookup(), { wrapper })
    await waitFor(() => expect(result.current('soup')?.id).toBe(2))
    expect(result.current('  FISH   pie ')?.id).toBe(1)
    expect(result.current('fish pie')?.name).toBe('Fish Pie')
    expect(result.current('pasta')).toBeUndefined()
  })
  it('is undefined for everything until the Tags load', () => {
    const { wrapper } = setup([tag(1, 'Fish')])
    const { result } = renderHook(() => useTagLookup(), { wrapper })
    expect(result.current('fish')).toBeUndefined()
  })
})
