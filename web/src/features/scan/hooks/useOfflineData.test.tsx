import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemorySnapshotStore } from '../lib/snapshots'
import type { OfflineData } from '../types'

const api = vi.hoisted(() => ({ offlineData: vi.fn() }))
vi.mock('../api', () => ({ scanApi: api }))
const snapshots = vi.hoisted(() => ({ store: undefined as undefined | ReturnType<typeof import('../lib/snapshots').createMemorySnapshotStore> }))
vi.mock('../lib/idbStore', () => ({ appSnapshots: () => snapshots.store }))

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

import { useOfflineData } from './useOfflineData'

const data = (productIds: number[]): OfflineData => ({
  shopId: 2,
  shopName: 'Coop',
  catalog: { globalBarcodes: {}, weightRules: [], weightProducts: {} },
  products: productIds.map((id) => ({ id, name: `Product ${id}`, ingredientId: 1, ingredientName: 'x', baseUnit: 'g', packSize: 500, lastPriceCents: null })),
})

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper, client }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  snapshots.store = createMemorySnapshotStore()
  api.offlineData.mockReset().mockResolvedValue(data([7]))
})
afterEach(() => vi.unstubAllGlobals())

describe('useOfflineData', () => {
  it('fetches the offline data of the Shop', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useOfflineData(2), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.offline?.products.map((p) => p.id)).toEqual([7]))
    expect(api.offlineData).toHaveBeenCalledWith(2)
  })

  it('fetches it again when a Product is added or changed (the `products` live event), so a second scan of a new barcode resolves', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useOfflineData(2), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.offline).not.toBeNull())
    expect(sse.handlers['products']).toBeTypeOf('function')
    api.offlineData.mockResolvedValue(data([7, 8]))
    sse.handlers['products']?.()
    await waitFor(() => expect(result.current.offline?.products.map((p) => p.id)).toEqual([7, 8]))
    expect(api.offlineData).toHaveBeenCalledTimes(2)
  })

  it('fetches it again when the live stream reconnects', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useOfflineData(2), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.offline).not.toBeNull())
    api.offlineData.mockResolvedValue(data([7, 9]))
    sse.reconnect.fn()
    await waitFor(() => expect(result.current.offline?.products.map((p) => p.id)).toEqual([7, 9]))
  })

  it('closes its live connection when the screen goes away', async () => {
    const { Wrapper } = wrapper()
    const { result, unmount } = renderHook(() => useOfflineData(2), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.offline).not.toBeNull())
    unmount()
    expect(sse.connection.close).toHaveBeenCalled()
  })
})
