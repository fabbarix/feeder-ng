import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/providers'
import { ApiError } from '../../../lib/http'
import { makeTotal } from '../testData'

// B9-20 (RES-02): useStockTotals gains `state` from dataState beside the `status` it already has.
// Pantry offline and never loaded is offlineUnknown (LoadState), not the old "Stock is not saved on this device yet" EmptyState.
const api = vi.hoisted(() => ({ totals: vi.fn(), lots: vi.fn(), spoiled: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))
import { useStockTotals } from './useStock'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  api.totals.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.dispatchEvent(new Event('online'))
})

describe('useStockTotals().state', () => {
  it('loading, ready, empty', async () => {
    api.totals.mockResolvedValue([makeTotal()])
    const a = renderHook(() => useStockTotals(), { wrapper })
    expect(a.result.current.state).toBe('loading')
    await waitFor(() => expect(a.result.current.state).toBe('ready'))
    api.totals.mockResolvedValue([])
    const b = renderHook(() => useStockTotals(), { wrapper })
    await waitFor(() => expect(b.result.current.state).toBe('empty'))
  })

  it('offline and never loaded: offlineUnknown', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    api.totals.mockRejectedValue(new ApiError(0, 'network', 'x'))
    const { result } = renderHook(() => useStockTotals(), { wrapper })
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))))
    expect(result.current.state).toBe('offlineUnknown')
  })

  it('online, the request keeps failing: failed', async () => {
    api.totals.mockRejectedValue(new ApiError(404, 'x', 'x'))
    const { result } = renderHook(() => useStockTotals(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('failed'))
  })
})
