// DS-TODAY: the hook behind the metric strip. Logic here, not in the component: the streak (Today's API), the Leftovers count
// (from the plan, passed in) and the Lines to get (the Shop seam) are composed by lib/metrics composeMetrics.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../settings/test-utils'
import * as shopSeam from '../shopSeam'
import { useTodayMetrics } from './useTodayMetrics'

vi.mock('../shopSeam', () => ({ useLinesToGet: vi.fn(() => ({ count: 0, loading: false })) }))
afterEach(() => vi.unstubAllGlobals())

describe('useTodayMetrics', () => {
  it('composes streak, Leftovers and Lines to get, in order', async () => {
    mockApi({ 'GET /api/today/streak': { days: 2 } })
    vi.mocked(shopSeam.useLinesToGet).mockReturnValue({ count: 16, loading: false })
    const { result } = renderHook(() => useTodayMetrics(3), { wrapper })
    await waitFor(() => expect(result.current.metrics.map((m) => m.id)).toEqual(['streak', 'leftovers', 'lines']))
    expect(result.current.metrics.map((m) => m.value)).toEqual(['2 d', '3', '16'])
  })

  it('has no metric while nothing is known (streak 0, no Leftovers, no Lines)', async () => {
    mockApi({ 'GET /api/today/streak': { days: 0 } })
    vi.mocked(shopSeam.useLinesToGet).mockReturnValue({ count: 0, loading: false })
    const { result } = renderHook(() => useTodayMetrics(0), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.metrics).toEqual([])
  })

  it('a failing streak endpoint counts as no streak, not as a broken Today', async () => {
    mockApi({ 'GET /api/today/streak': { status: 500, json: { error: { code: 'boom', message: 'x' } } } })
    vi.mocked(shopSeam.useLinesToGet).mockReturnValue({ count: 4, loading: false })
    const { result } = renderHook(() => useTodayMetrics(0), { wrapper })
    await waitFor(() => expect(result.current.metrics.map((m) => m.id)).toEqual(['lines']))
  })

  it('is loading until both the streak and the Shop list have answered', async () => {
    mockApi({ 'GET /api/today/streak': { days: 1 } })
    vi.mocked(shopSeam.useLinesToGet).mockReturnValue({ count: 0, loading: true })
    const { result } = renderHook(() => useTodayMetrics(0), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.loading).toBe(true)
  })
})
