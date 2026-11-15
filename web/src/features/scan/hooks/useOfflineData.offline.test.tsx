// B9-54 (RES-03, "Scan screen opened offline"): the Scan screen opened in the dead zone. With the app's `offlineFirst` query mode (lib/dataState,
// app/providers) the query RUNS while navigator.onLine is false and falls back to the copy saved on the phone, so a typed or scanned barcode
// resolves ("Waiting to sync" row, toast, banner count). With no saved copy either (this phone never scanned at this Shop) the status is
// 'unavailable' (not 'error', not an endless 'loading'): the screen says "This Shop’s barcodes aren’t on this phone yet".
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { createMemorySnapshotStore, snapshotKeys } from '../lib/snapshots'
import type { OfflineData } from '../types'

const api = vi.hoisted(() => ({ offlineData: vi.fn() }))
vi.mock('../api', () => ({ scanApi: api }))
const snapshots = vi.hoisted(() => ({ store: undefined as undefined | ReturnType<typeof import('../lib/snapshots').createMemorySnapshotStore> }))
vi.mock('../lib/idbStore', () => ({ appSnapshots: () => snapshots.store }))
vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))

import { useOfflineData } from './useOfflineData'

const saved: OfflineData = {
  shopId: 2,
  shopName: 'Coop',
  catalog: { globalBarcodes: { '08000500310427': 7 }, weightRules: [], weightProducts: {} },
  products: [{ id: 7, name: 'Passata', ingredientId: 1, ingredientName: 'passata', baseUnit: 'g', packSize: 700, lastPriceCents: null }],
}
const wrapper = () => {
  // the app's QueryClient: offlineFirst (lib/dataState), so a query is not paused while the browser says offline
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'offlineFirst' } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  snapshots.store = createMemorySnapshotStore()
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
  api.offlineData.mockReset().mockRejectedValue(new ApiError(0, 'network', 'The network is unreachable'))
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})

describe('useOfflineData offline', () => {
  it('opened offline with a saved copy: ready with the saved Products, so a known barcode resolves', async () => {
    await snapshots.store!.set(snapshotKeys.offline(2), saved)
    const { result } = renderHook(() => useOfflineData(2), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.offline?.catalog.globalBarcodes?.['08000500310427']).toBe(7)
  })

  it('opened offline with no saved copy: "unavailable", never an endless loading and never a generic error', async () => {
    const { result } = renderHook(() => useOfflineData(2), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.offline).toBeNull()
  })

  it('a failure with a server answer stays an error', async () => {
    api.offlineData.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    const { result } = renderHook(() => useOfflineData(2), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
