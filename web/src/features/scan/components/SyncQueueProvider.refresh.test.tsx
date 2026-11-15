// B9-54 (RES-03, "Sync"): "Each result clears its row's pending mark. The Shopping List refetches once (liveRefreshFor), and Stock is invalidated." The
// work Scan's controller did after each flush moves into the provider, because the queue syncs on every screen now: one list refresh and one Stock
// invalidation per flush that sent something (a Tick or a Scan), the offline data again when a Product was created or merged; nothing for a flush that
// sent nothing or found the server unreachable.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { createMemoryOpStore, OfflineQueue } from '../lib/queue'
import type { Op, ScanResult } from '../types'

const live = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../shop/lib/liveRefresh', () => ({ liveRefreshFor: () => live }))

import { SyncQueueProvider, useSharedSyncQueue } from './SyncQueueProvider'

const tick = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:01:00Z', kind: 'shop_tick', shopId: 1, ingredientId: 9, rangeTo: '2026-11-15', quantity: 50, covers: 150 })
const unknown = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:01:00Z', kind: 'shop_unknown', shopId: 1, barcode: '123', productName: 'New thing' })

function setup(sync: (ops: Op[]) => Promise<ScanResult[]>) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const queue = new OfflineQueue(createMemoryOpStore())
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <QueryClientProvider client={client}>
      <SyncQueueProvider queue={queue} api={{ sync }} isOnline={() => true}>
        {children}
      </SyncQueueProvider>
    </QueryClientProvider>
  )
  return { hook: renderHook(() => useSharedSyncQueue(), { wrapper }), invalidate }
}
const keys = (invalidate: { mock: { calls: unknown[][] } }): string[] => invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))

beforeEach(() => live.request.mockReset())

describe('SyncQueueProvider: what a flush refreshes', () => {
  it('a synced Tick: the list once and Stock once', async () => {
    const { hook, invalidate } = setup(async (ops) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult))
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await waitFor(() => expect(live.request).toHaveBeenCalledTimes(1))
    expect(keys(invalidate)).toContain('["stock"]')
    expect(keys(invalidate).filter((k: string) => k === '["stock"]')).toHaveLength(1)
  })

  it('a Product created by the batch: the offline data is read again as well', async () => {
    const { hook, invalidate } = setup(async (ops) =>
      ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied', scan: { productCreated: true, productId: 4, ingredientId: 1 } }) as unknown as ScanResult),
    )
    await act(() => hook.result.current.enqueue(unknown('n-1')))
    await waitFor(() => expect(keys(invalidate)).toContain('["scan","offline"]'))
  })

  it('an unreachable server refreshes nothing', async () => {
    const { hook, invalidate } = setup(async () => {
      throw new ApiError(0, 'network', 'down')
    })
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await new Promise((r) => setTimeout(r, 30))
    expect(live.request).not.toHaveBeenCalled()
    expect(keys(invalidate)).not.toContain('["stock"]')
  })
})
