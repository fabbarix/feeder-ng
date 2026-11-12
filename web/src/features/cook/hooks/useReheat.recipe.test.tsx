import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CookTimer } from '../types'

const api = vi.hoisted(() => ({ timers: vi.fn(), startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), cancelTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))
vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

import { useReheat } from './useReheat'

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 3 }
const SCOPE = 'meal:2026-11-10/2/3'
const NOW = '2026-11-10T18:00:00Z'

const timer = (over: Partial<CookTimer> = {}): CookTimer => ({
  id: 5, scope: SCOPE, step: null, label: 'Reheat', durationSeconds: 180, state: 'running', remainingSeconds: 150,
  endsAt: '2026-11-10T18:02:30Z', startedAt: NOW, ...over,
})

function setup(timers: CookTimer[] = [], portions = 2, reheatMinutes?: number) {
  api.timers.mockResolvedValue({ now: NOW, timers })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useReheat(key, portions, reheatMinutes), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.startTimer.mockResolvedValue(timer())
})

describe('useReheat with the Recipe reheat time (R12)', () => {
  it('starts at the Recipe time when it is set, whatever the portions', async () => {
    const { result } = setup([], 2, 5)
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    expect(result.current.durationSeconds).toBe(300)
  })

  it('falls back to the formula when the Recipe has no reheat time', async () => {
    const { result } = setup([], 3, undefined)
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    expect(result.current.durationSeconds).toBe(240)
  })

  it('adjusts in 30 s steps from the Recipe time and starts the timer with it', async () => {
    const { result } = setup([], 2, 5)
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    act(() => result.current.adjust(30))
    expect(result.current.durationSeconds).toBe(330)
    await act(() => result.current.start())
    expect(api.startTimer).toHaveBeenCalledWith({ scope: SCOPE, label: 'Reheat', durationSeconds: 330 })
  })

  it('a Recipe time of 30 minutes cannot be raised further', async () => {
    const { result } = setup([], 2, 30)
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    act(() => result.current.adjust(30))
    expect(result.current.durationSeconds).toBe(1800)
  })
})
