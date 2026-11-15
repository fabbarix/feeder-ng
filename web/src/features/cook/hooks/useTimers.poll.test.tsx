// B9-25 (PC-04): useTimers is split for the shell. It gets a `pollMs` option (the shell passes 15000) so a timer another device starts,
// pauses or finishes shows up even when a live event is missed. Without the option nothing changes for Cook Mode and the board.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CookTimer } from '../types'

const api = vi.hoisted(() => ({ timers: vi.fn(), startTimer: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), cancelTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))
vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))

import { useTimers } from './useTimers'

const SERVER_NOW = '2026-11-09T18:00:00Z'
const T0 = Date.parse(SERVER_NOW)
const timer = (over: Partial<CookTimer> = {}): CookTimer => ({ id: 1, scope: 'recipe:12', step: 2, label: 'Step 2: Simmer', durationSeconds: 600, state: 'running', remainingSeconds: 600, endsAt: '2026-11-09T18:10:00Z', startedAt: SERVER_NOW, ...over })

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  Object.values(api).forEach((f) => f.mockReset())
  api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer()] })
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useTimers pollMs', () => {
  it('with pollMs it asks the server again every pollMs, and shows what changed', async () => {
    const { result } = renderHook(() => useTimers(undefined, { now: () => T0, pollMs: 15000 }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(api.timers).toHaveBeenCalledTimes(1)
    api.timers.mockResolvedValue({ now: SERVER_NOW, timers: [timer(), timer({ id: 2, label: 'Eggs', scope: null, step: null })] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    await waitFor(() => expect(api.timers.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    const before = api.timers.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    await waitFor(() => expect(api.timers.mock.calls.length).toBe(before + 1))
  })

  it('does not ask before pollMs has passed', async () => {
    const { result } = renderHook(() => useTimers(undefined, { now: () => T0, pollMs: 15000 }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14000)
    })
    expect(api.timers).toHaveBeenCalledTimes(1)
  })

  it('without pollMs it never polls (Cook Mode and the board keep their behaviour)', async () => {
    const { result } = renderHook(() => useTimers(undefined, { now: () => T0 }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(api.timers).toHaveBeenCalledTimes(1)
  })

  it('a failed poll keeps the timers and the local countdown going (offline)', async () => {
    let nowMs = T0
    const { result } = renderHook(() => useTimers(undefined, { now: () => nowMs, pollMs: 15000, tickMs: 1000 }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    api.timers.mockRejectedValue(new Error('offline'))
    nowMs += 20000
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]!.seconds).toBe(580)
  })
})
