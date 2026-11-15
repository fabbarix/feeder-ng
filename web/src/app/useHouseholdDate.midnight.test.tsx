// B9-44 (follow-up of B9-20, RES-05): Today stays open past midnight, so useHouseholdDate re-renders when the Household's day changes (a timer to
// the next midnight in its zone, and again when the tab becomes visible), not only when something else re-renders the screen.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ME_CACHE_KEY } from './meCache'
import { useHouseholdDate } from './useHouseholdDate'

const me = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: false }
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ ...me, householdTimeZone: 'Europe/Rome' }))
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  vi.useFakeTimers()
  // 23:59:30 on Sat 14 Nov in Rome (UTC+1)
  vi.setSystemTime(new Date('2026-11-14T22:59:30Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useHouseholdDate: midnight', () => {
  it('moves to the next day by itself when the Household’s midnight passes', () => {
    const { result } = renderHook(() => useHouseholdDate(), { wrapper })
    expect(result.current).toBe('2026-11-14')
    act(() => {
      vi.advanceTimersByTime(31_000)
    })
    expect(result.current).toBe('2026-11-15')
  })

  it('does not re-render before midnight (no timer a minute early)', () => {
    let renders = 0
    renderHook(() => (renders++, useHouseholdDate()), { wrapper })
    const before = renders
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(renders).toBe(before)
  })

  it('catches up when the tab becomes visible after a night asleep', () => {
    const { result } = renderHook(() => useHouseholdDate(), { wrapper })
    expect(result.current).toBe('2026-11-14')
    vi.setSystemTime(new Date('2026-11-15T07:00:00Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-11-15')
  })

  it('with no zone known it stays null and sets no timer', () => {
    localStorage.clear()
    const { result } = renderHook(() => useHouseholdDate(), { wrapper })
    expect(result.current).toBeNull()
    act(() => {
      vi.advanceTimersByTime(86_400_000)
    })
    expect(result.current).toBeNull()
  })

  it('an injected clock (the `now` argument) is honoured and leaves the timer alone', () => {
    const { result } = renderHook(() => useHouseholdDate(() => new Date('2026-11-14T10:00:00Z')), { wrapper })
    expect(result.current).toBe('2026-11-14')
  })
})
