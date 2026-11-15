// B9-40 (PC-15): useReheat says when the timer is finished and can restart it.
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
  id: 5, scope: SCOPE, step: null, label: 'Reheat', durationSeconds: 240, state: 'running', remainingSeconds: 150, endsAt: '2026-11-10T18:02:30Z', startedAt: NOW, ...over,
})

function setup(timers: CookTimer[]) {
  api.timers.mockResolvedValue({ now: NOW, timers })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useReheat(key, 2), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.startTimer.mockResolvedValue(timer({ id: 6 }))
  api.cancelTimer.mockResolvedValue(undefined)
})

describe('useReheat finished and restart (PC-15)', () => {
  it('is not finished with no timer, a running timer or a paused one', async () => {
    const none = setup([])
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    expect(none.result.current.finished).toBe(false)
    const running = setup([timer()])
    await waitFor(() => expect(running.result.current.timer).not.toBeNull())
    expect(running.result.current.finished).toBe(false)
    const paused = setup([timer({ state: 'paused' })])
    await waitFor(() => expect(paused.result.current.timer).not.toBeNull())
    expect(paused.result.current.finished).toBe(false)
  })

  it('is finished once the timer is finished', async () => {
    const { result } = setup([timer({ state: 'finished', remainingSeconds: 0 })])
    await waitFor(() => expect(result.current.timer).not.toBeNull())
    expect(result.current.finished).toBe(true)
  })

  it('restart deletes the finished timer, then starts a new Reheat timer of the same length', async () => {
    const { result } = setup([timer({ state: 'finished', remainingSeconds: 0 })])
    await waitFor(() => expect(result.current.timer).not.toBeNull())
    await act(() => result.current.restart())
    expect(api.cancelTimer).toHaveBeenCalledWith(5)
    expect(api.startTimer).toHaveBeenCalledWith({ scope: SCOPE, label: 'Reheat', durationSeconds: 240 })
    expect(api.cancelTimer.mock.invocationCallOrder[0]!).toBeLessThan(api.startTimer.mock.invocationCallOrder[0]!)
  })

  it('restart does nothing without a timer', async () => {
    const { result } = setup([])
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    await act(() => result.current.restart())
    expect(api.cancelTimer).not.toHaveBeenCalled()
    expect(api.startTimer).not.toHaveBeenCalled()
  })
})
