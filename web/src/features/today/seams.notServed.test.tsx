// B5-F1 (ADR 0014): a Meal Slot that is Not served today still gives the Tonight tile something to show.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const dinner = { date: '2026-11-10', mealSlotId: 4, name: 'Dinner', notServed: true }
const h = vi.hoisted(() => ({ plan: { slots: [] as unknown[], today: '2026-11-10', isLoading: false, failed: false, refetch: vi.fn() } }))
vi.mock('../plan', () => ({
  heroSelection: () => null,
  notServedToday: (slots: { notServed?: boolean }[]) => slots.filter((s) => s.notServed),
  usePlan: () => h.plan,
  useToConfirm: () => ({ slots: [], isLoading: false, failed: false }),
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

describe('Today seam: Not served tonight', () => {
  it('hands the Not served slots of today to the Tonight tile', () => {
    h.plan.slots = [dinner]
    const { result } = renderHook(() => useTodayTileData(), { wrapper })
    expect(result.current.notServedToday).toEqual([dinner])
  })

  it('counts as something to show: the Tonight tile is in the layout even without a hero meal', () => {
    h.plan.slots = [dinner]
    const { result } = renderHook(() => useTodayPlan(), { wrapper })
    expect(result.current.hasNextMeal).toBe(true)
  })

  it('nothing planned and nothing Not served: no Tonight tile', () => {
    h.plan.slots = []
    const { result } = renderHook(() => useTodayPlan(), { wrapper })
    expect(result.current.hasNextMeal).toBe(false)
  })
})
