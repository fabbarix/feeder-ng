import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardData } from '../types'

const api = vi.hoisted(() => ({ board: vi.fn() }))
vi.mock('../api', () => ({ boardApi: api }))

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

import { useBoard, useBoardScheme, useNow } from './useBoard'

const board = (over: Partial<BoardData['theme']> = {}): BoardData => ({
  now: '2026-11-09T12:00:00Z',
  today: '2026-11-09',
  theme: { dark: false, nextChangeAt: '2026-11-09T15:55:00Z', source: 'sun', reason: '', ...over },
  streak: { days: 4 },
  nextAdvance: null,
})

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  api.board.mockReset().mockResolvedValue(board())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useBoard', () => {
  it('loads the board', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useBoard(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data?.streak.days).toBe(4))
  })

  it.each(['plan', 'stock', 'timers', 'cook'])('refetches on the %s topic', async (topic) => {
    const { Wrapper } = wrapper()
    renderHook(() => useBoard(), { wrapper: Wrapper })
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(1))
    expect(sse.connection.subscribe).toHaveBeenCalledWith(topic, expect.any(Function))
    await act(async () => sse.handlers[topic]!())
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(2))
  })

  it('refetches after a reconnect and shares one connection', async () => {
    const { Wrapper } = wrapper()
    renderHook(() => useBoard(), { wrapper: Wrapper })
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(1))
    expect(sse.connectEvents).toHaveBeenCalledTimes(1)
    await act(async () => sse.fireReconnect())
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(2))
  })
})

describe('useBoardScheme', () => {
  const NOW = Date.parse('2026-11-09T15:54:00Z')

  it('is light until the data arrives', () => {
    expect(renderHook(() => useBoardScheme(undefined, vi.fn(), () => NOW)).result.current.dark).toBe(false)
  })

  it('follows theme.dark and asks for fresh data when the change is due, not before', () => {
    vi.useFakeTimers()
    const refetch = vi.fn()
    const { result } = renderHook(() => useBoardScheme(board(), refetch, () => NOW))
    expect(result.current.dark).toBe(false)
    act(() => vi.advanceTimersByTime(59_000))
    expect(refetch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(2_000))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows dark when the server says dark', () => {
    expect(renderHook(() => useBoardScheme(board({ dark: true }), vi.fn(), () => NOW)).result.current.dark).toBe(true)
  })

  it('re-arms for a new nextChangeAt and clears the old timeout', () => {
    vi.useFakeTimers()
    const refetch = vi.fn()
    const { rerender } = renderHook(({ d }) => useBoardScheme(d, refetch, () => NOW), { initialProps: { d: board() } })
    rerender({ d: board({ dark: true, nextChangeAt: '2026-11-10T05:52:00Z' }) })
    act(() => vi.advanceTimersByTime(120_000))
    expect(refetch).not.toHaveBeenCalled()
  })

  it('clears its timeout on unmount', () => {
    vi.useFakeTimers()
    const refetch = vi.fn()
    const { unmount } = renderHook(() => useBoardScheme(board(), refetch, () => NOW))
    unmount()
    act(() => vi.advanceTimersByTime(120_000))
    expect(refetch).not.toHaveBeenCalled()
  })
})

describe('useNow', () => {
  it('ticks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'))
    const { result } = renderHook(() => useNow(1000))
    const first = result.current.getTime()
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.getTime() - first).toBe(3000)
  })
})
