// B9-29 (SSP-10): usePutAway() -> { putAway(moves): Promise<{lots, skipped}> }. One request for all the moves
// (POST /api/stock/lots/put-away); Stock refetches afterwards, so the Not sorted list and the group counts follow.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ putAway: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))

import { usePutAway } from './usePutAway'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => usePutAway(), { wrapper: Wrapper }), spy }
}

beforeEach(() => api.putAway.mockReset().mockResolvedValue({ lots: [{ id: 5 }], skipped: [6] }))

describe('usePutAway', () => {
  it('sends every move in one request, resolves with the answer and refreshes Stock', async () => {
    const { result, spy } = setup()
    const moves = [
      { lotId: 5, storagePlaceId: 3 },
      { lotId: 6, storagePlaceId: 3 },
    ]
    let answer: unknown
    await act(async () => {
      answer = await result.current.putAway(moves)
    })
    expect(api.putAway).toHaveBeenCalledTimes(1)
    expect(api.putAway).toHaveBeenCalledWith(moves)
    expect(answer).toEqual({ lots: [{ id: 5 }], skipped: [6] })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stock'] }))
  })
  it('rejects when the server refuses (nothing moved), and refreshes nothing', async () => {
    api.putAway.mockRejectedValue(new Error('unknown Storage Place'))
    const { result, spy } = setup()
    await expect(result.current.putAway([{ lotId: 5, storagePlaceId: 99 }])).rejects.toThrow('unknown Storage Place')
    expect(spy).not.toHaveBeenCalled()
  })
})
