import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (data: unknown) => void
const topics = new Map<string, Handler>()
const reconnects: Array<() => void> = []
const close = vi.fn()

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
    close,
  }),
}))

import { useProductsLiveUpdates } from './useProductsLiveUpdates'

const KEYS = [['shops'], ['products'], ['catalog']]

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const view = renderHook(() => useProductsLiveUpdates(), { wrapper })
  const invalidated = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
  return { spy, view, invalidated }
}

describe('useProductsLiveUpdates', () => {
  beforeEach(() => {
    topics.clear()
    reconnects.length = 0
    close.mockClear()
    vi.stubGlobal('EventSource', class {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('subscribes to the products topic', () => {
    setup()
    expect(topics.has('products')).toBe(true)
  })

  it.each(['shops', 'products', 'prices', 'purchases'])('a "%s" change invalidates shops, products and catalog', (changed) => {
    const { invalidated } = setup()
    topics.get('products')?.({ changed })
    expect(invalidated()).toEqual(expect.arrayContaining(KEYS))
  })

  it('refetches the same three after a reconnect', () => {
    const { invalidated } = setup()
    reconnects[0]?.()
    expect(invalidated()).toEqual(expect.arrayContaining(KEYS))
  })

  it('unsubscribes and closes the connection on unmount', () => {
    const { view } = setup()
    view.unmount()
    expect(topics.has('products')).toBe(false)
    expect(close).toHaveBeenCalled()
  })
})
