import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CookTimer } from '../types'

const api = vi.hoisted(() => ({ timers: vi.fn(), startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), cancelTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))

const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  let reconnect: () => void = () => {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn((cb: () => void) => {
      reconnect = cb
      return vi.fn()
    }),
    close: vi.fn(),
  }
  return { handlers, connection, connectEvents: vi.fn(() => connection), fireReconnect: () => reconnect() }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { useTimers } from './useTimers'

const SERVER_NOW = '2026-11-09T18:00:00Z'
const T0 = Date.parse(SERVER_NOW)

function timer(over: Partial<CookTimer> = {}): CookTimer {
  return { id: 1, scope: 'recipe:12', step: 2, label: 'Step 2: Simmer', durationSeconds: 600, state: 'running', remainingSeconds: 600, endsAt: '2026-11-09T18:10:00Z', startedAt: SERVER_NOW, ...over }
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  Object.values(api).forEach((f) => f.mockReset())
  api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer()] })
  api.pauseTimer.mockResolvedValue(timer({ state: 'paused' }))
  api.resumeTimer.mockResolvedValue(timer())
  api.cancelTimer.mockResolvedValue(undefined)
  api.startTimer.mockResolvedValue(timer({ id: 9 }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useTimers', () => {
  it('loads the timers with their seconds left', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useTimers(undefined, { now: () => T0 }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0]!.seconds).toBe(600)
    expect(api.timers).toHaveBeenCalledWith(undefined)
  })

  it('passes the scope on', async () => {
    const { Wrapper } = wrapper()
    renderHook(() => useTimers('recipe:12', { now: () => T0 }), { wrapper: Wrapper })
    await waitFor(() => expect(api.timers).toHaveBeenCalledWith('recipe:12'))
  })

  it('counts down every tick without asking the server', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    let nowMs = T0
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useTimers(undefined, { now: () => nowMs, tickMs: 1000 }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    nowMs += 5000
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.items[0]!.seconds).toBe(595)
    expect(api.timers).toHaveBeenCalledTimes(1)
  })

  it('corrects for a device clock that is behind the server', async () => {
    const { Wrapper } = wrapper()
    // The device thinks it is 30 s earlier than the server: the countdown must still read 600.
    const { result } = renderHook(() => useTimers(undefined, { now: () => T0 - 30_000 }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0]!.seconds).toBe(600)
  })

  it('refetches on the timers SSE topic and after a reconnect', async () => {
    const { Wrapper } = wrapper()
    renderHook(() => useTimers(undefined, { now: () => T0 }), { wrapper: Wrapper })
    await waitFor(() => expect(api.timers).toHaveBeenCalledTimes(1))
    expect(sse.connection.subscribe).toHaveBeenCalledWith('timers', expect.any(Function))
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer(), timer({ id: 2, label: 'Eggs', step: null, scope: null })] })
    await act(async () => sse.handlers['timers']!())
    await waitFor(() => expect(api.timers).toHaveBeenCalledTimes(2))
    await act(async () => sse.fireReconnect())
    await waitFor(() => expect(api.timers).toHaveBeenCalledTimes(3))
  })

  it('actions call the API and refetch', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useTimers(undefined, { now: () => T0 }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    await act(async () => result.current.pause(1))
    expect(api.pauseTimer).toHaveBeenCalledWith(1)
    await act(async () => result.current.resume(1))
    expect(api.resumeTimer).toHaveBeenCalledWith(1)
    await act(async () => result.current.cancel(1))
    expect(api.cancelTimer).toHaveBeenCalledWith(1)
    let started: CookTimer | undefined
    await act(async () => {
      started = await result.current.start({ label: 'Eggs', durationSeconds: 180 })
    })
    expect(api.startTimer).toHaveBeenCalledWith({ label: 'Eggs', durationSeconds: 180 })
    expect(started?.id).toBe(9)
    await waitFor(() => expect(api.timers.mock.calls.length).toBeGreaterThanOrEqual(5))
  })
})
