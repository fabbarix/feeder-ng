// B9-44 (RES-05, TB-11, SAFE-09/SSP-17): the seam's new answers. Use soon waits for the Household date (never computed against the device date,
// never against ''), names its Lot and amount from the Lots, and the spoiled calls carry their Undo calls.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  today: '2026-11-09',
  spoiled: { data: [], today: '2026-11-09', isLoading: false, status: 'ready', throwOut: vi.fn(), keep: vi.fn(), undoThrowOut: vi.fn(), undoKeep: vi.fn(), refetch: vi.fn() } as Record<string, unknown>,
}))
vi.mock('../plan', () => ({
  heroSelection: () => null,
  useHeroClock: () => new Date('2026-11-09T12:00:00Z'),
  heroNextChange: () => null,
  justServed: () => [],
  withJustServed: (served: unknown[], server: unknown[]) => [...served, ...server],
  usePlan: () => ({ slots: [], today: h.today, isLoading: h.today === '', failed: false, refetch: vi.fn() }),
  useToConfirm: () => ({ slots: [], isLoading: false, failed: false }),
  useCouldntPlan: () => ({ slots: [], isLoading: false, failed: false }),
  useLeftovers: () => ({ leftovers: [], isLoading: false, failed: false }),
}))
vi.mock('../stock', () => ({
  useSpoiledLots: () => h.spoiled,
  useStockTotals: () => ({ data: [{ ingredientId: 1, name: 'Flour', baseUnit: 'g', total: 900, lotCount: 2, nextGoesOff: '2026-11-10', useSoon: true, spoiledCount: 0 }], system: 'metric', isLoading: false, status: 'ready', refetch: vi.fn() }),
  useAllLots: () => ({ data: [{ id: 11, ingredientId: 1, ingredientName: 'flour', baseUnit: 'g', quantity: 500, purchased: '2026-11-01', goesOff: '2026-11-10', spoiled: false }, { id: 12, ingredientId: 1, ingredientName: 'flour', baseUnit: 'g', quantity: 400, purchased: '2026-11-01', goesOff: '2026-11-20', spoiled: false }], isLoading: false, status: 'ready', refetch: vi.fn() }),
}))
vi.mock('../shop', () => ({ ShoppingScreen: () => null }))
vi.mock('../scan', () => ({ useScanSessionActive: () => false }))

import { useTodayTileData } from './seams'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>

describe('Today seam: Use soon (RES-05, TB-11)', () => {
  it('has no Use soon rows until the plan has given the Household date', () => {
    h.today = ''
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    expect(result.current.useSoon).toEqual([])
  })

  it('with the Household date, names the soonest Lot and the amount going off on its day', () => {
    h.today = '2026-11-09'
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    expect(result.current.useSoon).toEqual([expect.objectContaining({ ingredientId: 1, name: 'Flour', when: 'good until tomorrow', quantity: 500, baseUnit: 'g', soonestLotId: 11 })])
  })
})

describe('Today seam: the spoiled calls (SAFE-09, SSP-17)', () => {
  it('hands the Pantry’s four calls to the screen: throwOut and keep resolve with their records, and each has its Undo', () => {
    h.today = '2026-11-09'
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    const calls = result.current.spoiledCalls!
    expect(Object.keys(calls).sort()).toEqual(['keep', 'throwOut', 'undoKeep', 'undoThrowOut'])
    void calls.throwOut(7)
    void calls.keep(7)
    void calls.undoThrowOut(9)
    void calls.undoKeep(7, '2026-11-08')
    expect(h.spoiled.throwOut).toHaveBeenCalledWith(7)
    expect(h.spoiled.keep).toHaveBeenCalledWith(7)
    expect(h.spoiled.undoThrowOut).toHaveBeenCalledWith(9)
    expect(h.spoiled.undoKeep).toHaveBeenCalledWith(7, '2026-11-08')
  })
})
