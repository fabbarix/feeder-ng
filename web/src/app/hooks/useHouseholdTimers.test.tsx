// B9-25 (PC-04): the shell's view of the household's timers. It composes useTimers (every timer, polled every 15 s, live events, local
// countdown) with lib/householdTimers (head, "+N", finished) and the alarm.
//   Rings: when a timer is SEEN to turn finished while the app is open (a countdown reaching 0, or the list now holding a finished timer
//   that was not there). The first list that loads never rings, though a timer already finished in it still shows the banner. The alarm
//   stops when no finished timer is left. The shell mounts this hook only in the framed pages, so Cook Mode (its own alarm) and the
//   board never ring twice.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlarmAdapter } from '../../features/cook/adapters/alarm'
import type { CookTimer } from '../../features/cook/types'

const api = vi.hoisted(() => ({ timers: vi.fn(), startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), cancelTimer: vi.fn() }))
vi.mock('../../features/cook/api', () => ({ cookApi: api }))
const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { useHouseholdTimers } from './useHouseholdTimers'

const SERVER_NOW = '2026-11-09T18:00:00Z'
const T0 = Date.parse(SERVER_NOW)
const timer = (over: Partial<CookTimer> = {}): CookTimer => ({
  id: 1, scope: 'recipe:12', step: 2, recipeName: 'Roast chicken', label: 'Step 3: roast the chicken', durationSeconds: 1500, state: 'running',
  remainingSeconds: 1500, endsAt: '2026-11-09T18:25:00Z', startedAt: SERVER_NOW, ...over,
})
function fakeAlarm() {
  const alarm = { play: vi.fn(), stop: vi.fn() }
  return alarm satisfies AlarmAdapter
}
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

let nowMs = T0
beforeEach(() => {
  nowMs = T0
  vi.stubGlobal('EventSource', class {})
  Object.values(api).forEach((f) => f.mockReset())
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer()] })
  api.cancelTimer.mockResolvedValue(undefined)
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const render = (alarm = fakeAlarm()) => ({ alarm, ...renderHook(() => useHouseholdTimers({ now: () => nowMs, alarm }), { wrapper: wrapper() }) })
const advance = async (ms: number) => {
  nowMs += ms
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useHouseholdTimers: what the pill shows', () => {
  it('no timers: no head, "+0", nothing finished, no alarm', async () => {
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [] })
    const { result, alarm } = render()
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    expect(result.current.head).toBeNull()
    expect(result.current.more).toBe(0)
    expect(result.current.finished).toEqual([])
    expect(result.current.ringing).toBe(false)
    expect(alarm.play).not.toHaveBeenCalled()
  })

  it('asks for the household\'s timers (no scope), not one Recipe\'s', async () => {
    render()
    await waitFor(() => expect(api.timers).toHaveBeenCalledWith(undefined))
  })

  it('the head is the soonest timer, with its seconds left; the others are "+N"', async () => {
    api.timers.mockResolvedValue({
      now: SERVER_NOW,
      timers: [timer({ id: 1 }), timer({ id: 2, label: 'Step 5: rest', endsAt: '2026-11-09T18:05:00Z', remainingSeconds: 300 }), timer({ id: 3, label: 'Eggs', scope: null, step: null, recipeName: undefined, endsAt: '2026-11-09T18:40:00Z' })],
    })
    const { result } = render()
    await waitFor(() => expect(result.current.head).not.toBeNull())
    expect(result.current.head).toMatchObject({ id: 2, title: 'Rest', seconds: 300, state: 'running' })
    expect(result.current.more).toBe(2)
    expect(result.current.all.map((t) => t.id)).toEqual([2, 1, 3])
  })

  it('the countdown runs on this device between polls (no request per second)', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.head?.seconds).toBe(1500))
    await advance(5000)
    expect(result.current.head?.seconds).toBe(1495)
    expect(api.timers).toHaveBeenCalledTimes(1)
  })

  it('polls every 15 s (a timer another device started shows without a live event)', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.head).not.toBeNull())
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer(), timer({ id: 2, label: 'Eggs', scope: null, step: null, endsAt: '2026-11-09T18:10:00Z' })] })
    await advance(15000)
    await waitFor(() => expect(result.current.more).toBe(1))
    expect(api.timers.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('a live "timers" event refetches at once', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.head).not.toBeNull())
    expect(sse.handlers['timers']).toBeTypeOf('function')
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [] })
    await act(async () => sse.handlers['timers']!())
    await waitFor(() => expect(result.current.head).toBeNull())
  })

  it('offline (the poll fails): the last timers stay and keep counting down', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.head?.seconds).toBe(1500))
    api.timers.mockRejectedValue(new Error('offline'))
    await advance(30000)
    expect(result.current.head?.seconds).toBe(1470)
  })
})

describe('useHouseholdTimers: the pill\'s accessible name changes once a minute', () => {
  it('nameSeconds holds within a minute while head.seconds ticks, and moves when the minute changes', async () => {
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer({ endsAt: '2026-11-09T18:18:42Z', remainingSeconds: 1122 })] })
    const { result } = render()
    await waitFor(() => expect(result.current.head?.seconds).toBe(1122))
    expect(result.current.nameSeconds).toBe(1122)
    await advance(10000)
    expect(result.current.head?.seconds).toBe(1112)
    expect(result.current.nameSeconds).toBe(1122) // 18:32 is still the 18th minute
    await advance(40000)
    expect(result.current.head?.seconds).toBe(1072) // 17:52
    expect(result.current.nameSeconds).toBe(1072)
  })
})

describe('useHouseholdTimers: a finish', () => {
  it('a running timer whose countdown reaches 0 turns finished, rings once, and is the finished list', async () => {
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer({ endsAt: '2026-11-09T18:00:05Z', remainingSeconds: 5 })] })
    const { result, alarm } = render()
    await waitFor(() => expect(result.current.head?.seconds).toBe(5))
    expect(alarm.play).not.toHaveBeenCalled()
    await advance(6000)
    expect(result.current.head).toMatchObject({ state: 'finished', seconds: 0 })
    expect(result.current.finished.map((t) => t.id)).toEqual([1])
    expect(result.current.ringing).toBe(true)
    expect(alarm.play).toHaveBeenCalledTimes(1)
    await advance(5000)
    expect(alarm.play).toHaveBeenCalledTimes(1)
  })

  it('a timer that another device\'s poll now reports finished rings too', async () => {
    const { result, alarm } = render()
    await waitFor(() => expect(result.current.head).not.toBeNull())
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer({ state: 'finished', remainingSeconds: 0 })] })
    await act(async () => sse.handlers['timers']!())
    await waitFor(() => expect(result.current.finished).toHaveLength(1))
    expect(alarm.play).toHaveBeenCalledTimes(1)
  })

  it('the first list that loads never rings, but a timer already finished in it still shows (the banner stays until acted on)', async () => {
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer({ state: 'finished', remainingSeconds: 0 })] })
    const { result, alarm } = render()
    await waitFor(() => expect(result.current.finished).toHaveLength(1))
    expect(result.current.head).toMatchObject({ state: 'finished' })
    expect(alarm.play).not.toHaveBeenCalled()
    expect(result.current.ringing).toBe(false)
  })

  it('a second timer finishing while the first is still undismissed rings for it as well', async () => {
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer({ id: 1, endsAt: '2026-11-09T18:00:05Z' }), timer({ id: 2, label: 'Step 5: rest', endsAt: '2026-11-09T18:00:20Z' })] })
    const { result, alarm } = render()
    await waitFor(() => expect(result.current.all).toHaveLength(2))
    await advance(6000)
    expect(alarm.play).toHaveBeenCalledTimes(1)
    await advance(15000)
    expect(result.current.finished.map((t) => t.id)).toEqual([1, 2])
    expect(alarm.play).toHaveBeenCalledTimes(2)
  })

  it('dismissFinished cancels every finished timer on the server (not the running ones), refetches, and stops the alarm', async () => {
    api.timers.mockResolvedValue({
      now: SERVER_NOW,
      timers: [timer({ id: 1, endsAt: '2026-11-09T18:00:05Z' }), timer({ id: 2, label: 'Step 5: rest', endsAt: '2026-11-09T18:00:07Z' }), timer({ id: 3, label: 'Eggs', scope: null, step: null, endsAt: '2026-11-09T18:30:00Z' })],
    })
    const { result, alarm } = render()
    await waitFor(() => expect(result.current.all).toHaveLength(3))
    await advance(8000)
    expect(result.current.finished.map((t) => t.id)).toEqual([1, 2])
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer({ id: 3, label: 'Eggs', scope: null, step: null, endsAt: '2026-11-09T18:30:00Z' })] })
    await act(async () => {
      await result.current.dismissFinished()
    })
    expect(api.cancelTimer.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2])
    await waitFor(() => expect(result.current.finished).toEqual([]))
    expect(result.current.head?.id).toBe(3)
    expect(alarm.stop).toHaveBeenCalled()
    expect(result.current.ringing).toBe(false)
  })

  it('unmounting (leaving the framed pages, entering Cook Mode) stops the alarm', async () => {
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer({ endsAt: '2026-11-09T18:00:05Z' })] })
    const { result, alarm, unmount } = render()
    await waitFor(() => expect(result.current.head).not.toBeNull())
    await advance(6000)
    expect(alarm.play).toHaveBeenCalled()
    unmount()
    expect(alarm.stop).toHaveBeenCalled()
  })
})
