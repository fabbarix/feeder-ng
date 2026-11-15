// B9-39 (TB-01): Today's seam reads the clock through `useHeroClock`, selects the hero with that time, and puts the just-served rows first in
// To confirm (`withJustServed(justServed(slots, now, today), server)`). The names are imported from '../plan' (the barrel), as heroSelection is.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-11-10T14:44:00Z')
const h = vi.hoisted(() => ({
  slots: [{ date: '2026-11-10', mealSlotId: 3 }] as unknown[],
  server: [{ date: '2026-11-09', mealSlotId: 3, name: 'Dinner' }] as unknown[],
  served: [{ date: '2026-11-10', mealSlotId: 2, name: 'Lunch' }] as unknown[],
  clockArg: null as null | ((now: Date) => number | null),
  heroSelection: vi.fn(() => null),
  justServed: vi.fn(),
  withJustServed: vi.fn(),
  heroNextChange: vi.fn(() => 123),
}))
vi.mock('../plan', () => ({
  heroSelection: h.heroSelection,
  justServed: h.justServed,
  withJustServed: h.withJustServed,
  heroNextChange: h.heroNextChange,
  useHeroClock: (fn: (now: Date) => number | null) => {
    h.clockArg = fn
    return NOW
  },
  notServedToday: () => [],
  usePlan: () => ({ slots: h.slots, today: '2026-11-10', isLoading: false, failed: false, refetch: vi.fn() }),
  useToConfirm: () => ({ slots: h.server, isLoading: false, failed: false }),
  useCouldntPlan: () => ({ slots: [], isLoading: false, failed: false }),
  useLeftovers: () => ({ leftovers: [], isLoading: false, failed: false }),
}))
vi.mock('../stock', () => ({
  useSpoiledLots: () => ({ data: [], today: '2026-11-10', isLoading: false, status: 'ready', throwOut: vi.fn(), keep: vi.fn(), refetch: vi.fn() }),
  useStockTotals: () => ({ data: [], system: 'metric', isLoading: false, status: 'ready', refetch: vi.fn() }),
}))
vi.mock('../shop', () => ({ ShoppingScreen: () => null }))
vi.mock('../scan', () => ({ useScanSessionActive: () => false }))

import { useTodayPlan, useTodayTileData } from './seams'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
beforeEach(() => {
  h.clockArg = null
  h.heroSelection.mockClear()
  h.justServed.mockReset().mockReturnValue(h.served)
  h.withJustServed.mockReset().mockImplementation((a: unknown[], b: unknown[]) => [...a, ...b])
  h.heroNextChange.mockClear()
})

describe('Today seam: the clock and the just-served rows (TB-01)', () => {
  it('the hero is chosen with the clock\'s time, and that time is the `now` the hero is shown with', () => {
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    expect(h.heroSelection).toHaveBeenCalledWith(h.slots, NOW, '2026-11-10')
    expect(result.current.now).toBe(NOW)
  })

  it('the clock waits for the next change of the hero: heroNextChange(slots, now, today)', () => {
    renderHook(() => useTodayTileData(), { wrapper })
    const at = new Date('2026-11-10T15:00:00Z')
    expect(h.clockArg!(at)).toBe(123)
    expect(h.heroNextChange).toHaveBeenCalledWith(h.slots, at, '2026-11-10')
  })

  it('To confirm is the just-served rows first, then the server\'s (de-duplicated by the lib), and `justServed` is the first part', () => {
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    expect(h.justServed).toHaveBeenCalledWith(h.slots, NOW, '2026-11-10')
    expect(h.withJustServed).toHaveBeenCalledWith(h.served, h.server)
    expect(result.current.toConfirm).toEqual([...h.served, ...h.server])
    expect(result.current.justServed).toEqual(h.served)
  })

  it('the layout counts them: the To confirm tile shows even when the server has nothing yet', () => {
    h.server = []
    const { result } = renderHook(() => useTodayPlan(), { wrapper })
    expect(result.current.toConfirm).toBe(1)
    h.server = [{ date: '2026-11-09', mealSlotId: 3, name: 'Dinner' }]
  })
})
