import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ME_CACHE_KEY } from './meCache'
import { useHouseholdDate } from './useHouseholdDate'

// B9-20 (RES-05): Today's date is the Household's. Known from the first frame when the zone is remembered, and never the device's.
const me = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: false }
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const NOW = new Date('2026-11-14T14:30:00Z') // the device (UTC-6) is on the 14th, Kiritimati on the 15th

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useHouseholdDate', () => {
  it('is the household date at once from the remembered zone, while /api/me has not answered', () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ ...me, householdTimeZone: 'Pacific/Kiritimati' }))
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { result } = renderHook(() => useHouseholdDate(), { wrapper })
    expect(result.current).toBe('2026-11-15')
  })

  it('is null on a first launch ever (no zone known yet), not the device date', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { result } = renderHook(() => useHouseholdDate(), { wrapper })
    expect(result.current).toBeNull()
  })

  it('becomes the household date when /api/me answers with householdTimeZone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...me, householdTimeZone: 'Pacific/Kiritimati' }), { status: 200 })))
    const { result } = renderHook(() => useHouseholdDate(), { wrapper })
    await waitFor(() => expect(result.current).toBe('2026-11-15'))
  })

  it('stays the household date when the network is down (the remembered zone)', async () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ ...me, householdTimeZone: 'Pacific/Kiritimati' }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { result } = renderHook(() => useHouseholdDate(), { wrapper })
    await waitFor(() => expect(result.current).toBe('2026-11-15'))
  })

  it('takes the clock from the `now` argument when given', () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ ...me, householdTimeZone: 'UTC' }))
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { result } = renderHook(() => useHouseholdDate(() => new Date('2026-01-02T23:59:00Z')), { wrapper })
    expect(result.current).toBe('2026-01-02')
  })
})
