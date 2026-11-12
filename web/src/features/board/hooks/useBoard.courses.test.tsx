// CRS F: the board shows Course names, order and who eats what, so household changes refetch it (like `plan`).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardData } from '../types'

const api = vi.hoisted(() => ({ board: vi.fn() }))
vi.mock('../api', () => ({ boardApi: api }))

const sse = vi.hoisted(() => {
  const handlers: Record<string, (data?: unknown) => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: (data?: unknown) => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { useBoard } from './useBoard'

const data: BoardData = {
  now: '2026-11-09T12:00:00Z', today: '2026-11-09', theme: { dark: false, nextChangeAt: '2026-11-09T15:55:00Z', source: 'sun', reason: '' }, streak: { days: 1 }, nextAdvance: null,
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useBoard(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  api.board.mockReset()
  api.board.mockResolvedValue(data)
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
})

describe('useBoard and Courses', () => {
  it.each(['courses', 'mealSlots', 'attendance'])('refetches when the household changes `%s`', async (changed) => {
    const { result } = setup()
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(api.board).toHaveBeenCalledTimes(1)
    sse.handlers['household']?.({ changed })
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(2))
  })

  it.each(['settings', 'members'])('does not refetch for `%s`', async (changed) => {
    const { result } = setup()
    await waitFor(() => expect(result.current.data).toBeDefined())
    sse.handlers['household']?.({ changed })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.board).toHaveBeenCalledTimes(1)
  })

  it('still refetches on `plan`', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.data).toBeDefined())
    sse.handlers['plan']?.()
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(2))
  })
})
