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

function setup(timers: CookTimer[] = [], portions = 2) {
  api.timers.mockResolvedValue({ now: NOW, timers })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useReheat(key, portions), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.startTimer.mockResolvedValue(timer())
})

describe('useReheat (R12)', () => {
  it('starts at the default time for the portions (2 portions: 3 minutes) with no timer', async () => {
    const { result } = setup()
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    expect(result.current.durationSeconds).toBe(180)
    expect(result.current.timer).toBeNull()
  })

  it('adjust moves the chosen time within the limits', async () => {
    const { result } = setup()
    act(() => result.current.adjust(30))
    expect(result.current.durationSeconds).toBe(210)
    act(() => result.current.adjust(-3000))
    expect(result.current.durationSeconds).toBe(30)
  })

  it('start posts a labelled Reheat timer scoped to the Planned Meal with the chosen time', async () => {
    const { result } = setup()
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    act(() => result.current.adjust(60))
    await act(() => result.current.start())
    expect(api.startTimer).toHaveBeenCalledWith({ scope: SCOPE, label: 'Reheat', durationSeconds: 240 })
  })

  it('finds the meal\'s running Reheat timer and does not start a second one', async () => {
    const { result } = setup([timer()])
    await waitFor(() => expect(result.current.timer?.id).toBe(5))
    expect(result.current.secondsLeft).toBeGreaterThan(0)
    await act(() => result.current.start())
    expect(api.startTimer).not.toHaveBeenCalled()
  })

  it('ignores other meals\' timers and free timers', async () => {
    const { result } = setup([timer({ id: 6, scope: 'meal:2026-11-10/3' }), timer({ id: 7, scope: null, label: 'Eggs' })])
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    expect(result.current.timer).toBeNull()
  })

  it('pause, resume and cancel call the timer API with the timer id', async () => {
    const { result } = setup([timer()])
    await waitFor(() => expect(result.current.timer?.id).toBe(5))
    await act(() => result.current.pause())
    expect(api.pauseTimer).toHaveBeenCalledWith(5)
    await act(() => result.current.resume())
    expect(api.resumeTimer).toHaveBeenCalledWith(5)
    await act(() => result.current.cancel())
    expect(api.cancelTimer).toHaveBeenCalledWith(5)
  })

  it('two start() calls before the refetch post exactly one timer', async () => {
    const { result } = setup()
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    let release: (t: CookTimer) => void = () => {}
    api.startTimer.mockReturnValue(new Promise<CookTimer>((r) => { release = r }))
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.start()
      second = result.current.start()
    })
    expect(result.current.starting).toBe(true)
    await act(async () => {
      release(timer())
      await Promise.all([first, second])
    })
    expect(api.startTimer).toHaveBeenCalledTimes(1)
    expect(result.current.starting).toBe(false)
  })

  it('a failed start reports through onError, clears starting and does not reject', async () => {
    api.timers.mockResolvedValue({ now: NOW, timers: [] })
    api.startTimer.mockRejectedValue(new Error('boom'))
    const onError = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useReheat(key, 2, null, onError), { wrapper })
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    await act(() => result.current.start())
    expect(onError).toHaveBeenCalledTimes(1)
    expect(result.current.starting).toBe(false)
  })

  it('failed pause, resume and cancel report through onError and do not reject', async () => {
    api.timers.mockResolvedValue({ now: NOW, timers: [timer()] })
    api.pauseTimer.mockRejectedValue(new Error('x'))
    api.resumeTimer.mockRejectedValue(new Error('x'))
    api.cancelTimer.mockRejectedValue(new Error('x'))
    const onError = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useReheat(key, 2, null, onError), { wrapper })
    await waitFor(() => expect(result.current.timer?.id).toBe(5))
    await act(() => result.current.pause())
    await act(() => result.current.resume())
    await act(() => result.current.cancel())
    expect(onError).toHaveBeenCalledTimes(3)
  })
})
