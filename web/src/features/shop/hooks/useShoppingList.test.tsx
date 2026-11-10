import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { createMemorySnapshotStore } from '../../scan/lib/snapshots'
import { makeList } from '../testData'

const api = vi.hoisted(() => ({ list: vi.fn(), tick: vi.fn() }))
vi.mock('../api', () => ({ shopApi: api }))

const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  const reconnect: { fn: () => void } = { fn: () => {} }
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn((cb: () => void) => {
      reconnect.fn = cb
      return vi.fn()
    }),
    close: vi.fn(),
  }
  return { handlers, reconnect, connection, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { useShoppingActions } from './useShoppingActions'
import { useShoppingList } from './useShoppingList'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper, spy }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  sse.connection.subscribe.mockClear()
  sse.connection.close.mockClear()
  api.list.mockReset().mockResolvedValue(makeList())
})
afterEach(() => vi.unstubAllGlobals())

describe('useShoppingList', () => {
  it('fetches the list of the Shop and range', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useShoppingList({ shopId: 2, to: '2026-11-12', snapshots: createMemorySnapshotStore() }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toEqual(makeList()))
    expect(api.list).toHaveBeenCalledWith({ shopId: 2, to: '2026-11-12' })
    expect(result.current.stale).toBe(false)
  })

  it('refetches when the range changes', async () => {
    const { Wrapper } = wrapper()
    const snapshots = createMemorySnapshotStore()
    const { rerender } = renderHook(({ to }) => useShoppingList({ shopId: null, to, snapshots }), { wrapper: Wrapper, initialProps: { to: '2026-11-12' } })
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
    rerender({ to: '2026-11-15' })
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
    expect(api.list).toHaveBeenLastCalledWith({ shopId: null, to: '2026-11-15' })
  })

  it.each(['shopping', 'plan', 'stock', 'products'])('refetches the list when a `%s` event arrives', async (topic) => {
    const { Wrapper, spy } = wrapper()
    renderHook(() => useShoppingList({ shopId: 2, snapshots: createMemorySnapshotStore() }), { wrapper: Wrapper })
    await waitFor(() => expect(sse.connection.subscribe).toHaveBeenCalledWith(topic, expect.any(Function)))
    spy.mockClear()
    sse.handlers[topic]?.()
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['shopping'] }), { cancelRefetch: false }))
  })

  // WP7 (QA: about 4 requests per tick). A tick makes the server publish shopping + stock + plan + products events at once.
  it('a burst of events and a local change give ONE refetch, not one per event', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => ({ list: useShoppingList({ shopId: 2, snapshots: createMemorySnapshotStore() }), actions: useShoppingActions() }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.list.data).toBeDefined())
    await waitFor(() => expect(sse.connection.subscribe).toHaveBeenCalledWith('products', expect.any(Function)))
    expect(api.list).toHaveBeenCalledTimes(1)
    api.tick.mockResolvedValue({ ticked: true, lotId: 5, created: true })
    await act(() => result.current.actions.tick({ ingredientId: 2, to: '2026-11-15', quantity: 1400, shopId: 2 }))
    for (const topic of ['shopping', 'stock', 'plan', 'products']) sse.handlers[topic]?.()
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('reports a status for the screen: loading, then ready, empty, offline or error', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useShoppingList({ shopId: 2, snapshots: createMemorySnapshotStore() }), { wrapper: Wrapper })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))

    api.list.mockReset().mockResolvedValue(makeList({ lines: [], extras: [], progress: { ticked: 0, total: 0 } }))
    const empty = wrapper()
    const e = renderHook(() => useShoppingList({ shopId: 3, snapshots: createMemorySnapshotStore() }), { wrapper: empty.Wrapper })
    await waitFor(() => expect(e.result.current.status).toBe('empty'))

    api.list.mockReset().mockRejectedValue(new ApiError(404, 'not_found', 'no such Shop'))
    const bad = wrapper()
    const b = renderHook(() => useShoppingList({ shopId: 4, snapshots: createMemorySnapshotStore() }), { wrapper: bad.Wrapper })
    await waitFor(() => expect(b.result.current.status).toBe('error'))
    api.list.mockReset().mockResolvedValue(makeList())
    b.result.current.retry()
    await waitFor(() => expect(b.result.current.status).toBe('ready'))
  })

  it('status is offline while the saved snapshot is shown', async () => {
    const snapshots = createMemorySnapshotStore()
    const first = wrapper()
    const online = renderHook(() => useShoppingList({ shopId: 2, to: '2026-11-15', snapshots }), { wrapper: first.Wrapper })
    await waitFor(() => expect(online.result.current.status).toBe('ready'))
    online.unmount()
    api.list.mockReset().mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const second = wrapper()
    const offline = renderHook(() => useShoppingList({ shopId: 2, to: '2026-11-15', snapshots }), { wrapper: second.Wrapper })
    await waitFor(() => expect(offline.result.current.status).toBe('offline'))
  })

  it('refetches after the stream reconnects, and closes it on unmount', async () => {
    const { Wrapper, spy } = wrapper()
    const { unmount } = renderHook(() => useShoppingList({ shopId: 2, snapshots: createMemorySnapshotStore() }), { wrapper: Wrapper })
    await waitFor(() => expect(sse.connection.onReconnect).toHaveBeenCalled())
    spy.mockClear()
    sse.reconnect.fn()
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['shopping'] }), { cancelRefetch: false }))
    unmount()
    expect(sse.connection.close).toHaveBeenCalled()
  })

  it('does not open a stream where there is no EventSource', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('EventSource', undefined)
    const { Wrapper } = wrapper()
    renderHook(() => useShoppingList({ shopId: 2, snapshots: createMemorySnapshotStore() }), { wrapper: Wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(sse.connectEvents).not.toHaveBeenCalled()
  })

  it('saves each list as a snapshot and shows it, marked stale, when the network is down', async () => {
    const snapshots = createMemorySnapshotStore()
    const first = wrapper()
    const online = renderHook(() => useShoppingList({ shopId: 2, to: '2026-11-15', snapshots }), { wrapper: first.Wrapper })
    await waitFor(() => expect(online.result.current.data).toBeDefined())
    online.unmount()

    api.list.mockReset().mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const second = wrapper()
    const offline = renderHook(() => useShoppingList({ shopId: 2, to: '2026-11-15', snapshots }), { wrapper: second.Wrapper })
    await waitFor(() => expect(offline.result.current.stale).toBe(true))
    expect(offline.result.current.data).toEqual(makeList())
    expect(offline.result.current.error).toBeNull()
  })

  it('reports the error when offline with nothing saved', async () => {
    api.list.mockReset().mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useShoppingList({ shopId: 2, snapshots: createMemorySnapshotStore() }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.data).toBeUndefined()
    expect(result.current.stale).toBe(false)
  })

  it('does not hide a server error behind a snapshot', async () => {
    const snapshots = createMemorySnapshotStore()
    const first = wrapper()
    const ok = renderHook(() => useShoppingList({ shopId: 2, to: '2026-11-15', snapshots }), { wrapper: first.Wrapper })
    await waitFor(() => expect(ok.result.current.data).toBeDefined())
    ok.unmount()
    api.list.mockReset().mockRejectedValue(new ApiError(404, 'not_found', 'no such Shop'))
    const second = wrapper()
    const bad = renderHook(() => useShoppingList({ shopId: 2, to: '2026-11-15', snapshots }), { wrapper: second.Wrapper })
    await waitFor(() => expect(bad.result.current.error).not.toBeNull())
    expect(bad.result.current.stale).toBe(false)
  })
})
