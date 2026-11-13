// Round 2: one query function for ['plan','leftovers']. The plan's useLeftovers and the lib's useLeftovers share the key, so both
// must read the same array (the plan hook delegates to leftoversApi.list), whichever mounts first.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { leftover } from '../../../lib/leftovers/fixtures'
import { useLeftovers as useLibLeftovers } from '../../../lib/leftovers/useLeftoverActions'
import { ToastProvider } from '../../../ui'
import { mockApi } from '../test-utils'
import { useLeftovers as usePlanLeftovers } from './useTodayTiles'

afterEach(() => vi.unstubAllGlobals())

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (c: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={c}>
    <ToastProvider>{children}</ToastProvider>
  </QueryClientProvider>
)

describe('the Leftovers query key', () => {
  it('both hooks mounted together read the same Leftovers, with one request', async () => {
    const api = mockApi({ 'GET /api/plan/leftovers': { leftovers: [leftover({ id: 1 }), leftover({ id: 2, recipeName: 'Soup' })] } })
    const c = client()
    const { result } = renderHook(() => ({ plan: usePlanLeftovers(), lib: useLibLeftovers() }), { wrapper: wrap(c) })
    await waitFor(() => expect(result.current.lib.isPending).toBe(false))
    await waitFor(() => expect(result.current.plan.isLoading).toBe(false))
    expect(result.current.plan.leftovers.map((l) => l.id)).toEqual([1, 2])
    expect(result.current.lib.leftovers.map((l) => l.id)).toEqual([1, 2])
    expect(result.current.plan.failed).toBe(false)
    expect(api.callsTo('GET', '/api/plan/leftovers')).toHaveLength(1)
  })

  it('the cache holds an array, not the wire object', async () => {
    mockApi({ 'GET /api/plan/leftovers': { leftovers: [leftover({ id: 1 })] } })
    const c = client()
    const { result } = renderHook(() => usePlanLeftovers(), { wrapper: wrap(c) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(c.getQueryData(['plan', 'leftovers']))).toBe(true)
  })
})
