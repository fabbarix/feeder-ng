import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLot, makeTotal } from '../testData'

const api = vi.hoisted(() => ({ totals: vi.fn(), lots: vi.fn(), spoiled: vi.fn(), throwOut: vi.fn(), keep: vi.fn(), addLot: vi.fn(), setTotal: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { useSpoiledLots, useStockLots, useStockTotals } from './useStock'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
const setOnline = (online: boolean) => vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online)

beforeEach(() => {
  api.totals.mockReset().mockResolvedValue([makeTotal()])
  api.lots.mockReset().mockResolvedValue({ lots: [makeLot({ id: 5 })], today: '2026-11-09' })
  api.spoiled.mockReset().mockResolvedValue({ lots: [makeLot({ id: 3 })], today: '2026-11-09' })
})
afterEach(() => vi.restoreAllMocks())

describe('useStockTotals status', () => {
  it('goes loading -> ready', async () => {
    const { result } = renderHook(() => useStockTotals(), { wrapper: wrapper() })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('is empty only when the server answered with no Ingredients', async () => {
    api.totals.mockResolvedValue([])
    const { result } = renderHook(() => useStockTotals(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.status).toBe('empty'))
  })

  it('is error (not empty) when the request fails online', async () => {
    setOnline(true)
    api.totals.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useStockTotals(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBeUndefined()
  })

  it('is offline (not empty, not error) when the request fails while the device is offline', async () => {
    setOnline(false)
    api.totals.mockRejectedValue(new Error('Failed to fetch'))
    const { result } = renderHook(() => useStockTotals(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.status).toBe('offline'))
  })

  it('refetch retries the request', async () => {
    api.totals.mockRejectedValueOnce(new Error('500'))
    const { result } = renderHook(() => useStockTotals(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.status).toBe('error'))
    await result.current.refetch()
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })
})

describe('useSpoiledLots and useStockLots status', () => {
  it('spoiled: empty list is empty, rows are ready', async () => {
    api.spoiled.mockResolvedValueOnce({ lots: [], today: '2026-11-09' })
    const first = renderHook(() => useSpoiledLots(), { wrapper: wrapper() })
    await waitFor(() => expect(first.result.current.status).toBe('empty'))
    const second = renderHook(() => useSpoiledLots(), { wrapper: wrapper() })
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
  })

  it('lots: error online, offline when offline', async () => {
    api.lots.mockRejectedValue(new Error('500'))
    setOnline(true)
    const online = renderHook(() => useStockLots(7), { wrapper: wrapper() })
    await waitFor(() => expect(online.result.current.status).toBe('error'))
    setOnline(false)
    const offline = renderHook(() => useStockLots(7), { wrapper: wrapper() })
    await waitFor(() => expect(offline.result.current.status).toBe('offline'))
  })

  it('lots: nothing selected is not loading forever', () => {
    const { result } = renderHook(() => useStockLots(null), { wrapper: wrapper() })
    expect(result.current.status).not.toBe('error')
  })
})
