import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  plan: { slots: [], today: '2026-11-09', isLoading: false, failed: false, refetch: vi.fn() } as Record<string, unknown>,
  totals: { data: [], system: 'metric', isLoading: false, status: 'ready', refetch: vi.fn() } as Record<string, unknown>,
}))
vi.mock('../plan', () => ({
  heroSelection: () => null,
  usePlan: () => h.plan,
  useToConfirm: () => ({ slots: [], isLoading: false, failed: false }),
  useCouldntPlan: () => ({ slots: [], isLoading: false, failed: false }),
  useLeftovers: () => ({ leftovers: [], isLoading: false, failed: false }),
}))
vi.mock('../stock', () => ({
  useSpoiledLots: () => ({ data: [], today: '2026-11-09', isLoading: false, status: 'ready', throwOut: vi.fn(), keep: vi.fn(), refetch: vi.fn() }),
  useStockTotals: () => h.totals,
}))
vi.mock('../shop', () => ({ ShoppingScreen: () => null }))
vi.mock('../scan', () => ({ useScanSessionActive: () => false }))

import { useTodayStock, useTodayTileData } from './seams'

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { wrapper, spy }
}

describe('Today seam', () => {
  it('Try again invalidates every prefix Today reads: plan, stock and today (the streak)', () => {
    const { wrapper, spy } = setup()
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    result.current.retry?.()
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual(expect.arrayContaining([['plan'], ['stock'], ['today']]))
  })

  it('a failed stock-totals query makes Today failed', () => {
    const { wrapper } = setup()
    h.totals = { ...h.totals, status: 'error', data: undefined }
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    expect(result.current.loadFailed).toBe(true)
    const stock = renderHook(() => useTodayStock(), { wrapper })
    expect(stock.result.current.failed).toBe(true)
  })
})
