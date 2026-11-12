import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { makeList } from '../testData'

const api = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), notNeeded: vi.fn(), neededAfterAll: vi.fn() }))
vi.mock('../api', () => ({ shopApi: api }))

import { useShoppingActions } from './useShoppingActions'

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useShoppingActions(), { wrapper: Wrapper }), spy }
}

const keys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])

beforeEach(() => {
  api.notNeeded.mockReset().mockResolvedValue(makeList())
  api.neededAfterAll.mockReset().mockResolvedValue(makeList())
})

describe('useShoppingActions Not needed (B5-SH)', () => {
  it('marks a Line Not needed for the range and refreshes the list, not Stock (it adds no Lot)', async () => {
    const { result, spy } = setup()
    await act(() => result.current.notNeeded({ ingredientId: 2, to: '2026-11-15', shopId: 1 }))
    expect(api.notNeeded).toHaveBeenCalledWith({ ingredientId: 2, to: '2026-11-15', shopId: 1 })
    await waitFor(() => expect(keys(spy)).toContain('shopping'))
    expect(keys(spy)).not.toContain('stock')
  })

  it('"Needed after all" removes the mark and refreshes the list', async () => {
    const { result, spy } = setup()
    await act(() => result.current.neededAfterAll(2, '2026-11-15', 1))
    expect(api.neededAfterAll).toHaveBeenCalledWith(2, '2026-11-15', 1)
    await waitFor(() => expect(keys(spy)).toContain('shopping'))
    expect(keys(spy)).not.toContain('stock')
  })

  it('a failed call rejects with the ApiError and refreshes nothing', async () => {
    api.notNeeded.mockRejectedValue(new ApiError(409, 'not_on_list', 'That line is not on the list'))
    const { result, spy } = setup()
    await expect(act(() => result.current.notNeeded({ ingredientId: 2, to: '2026-11-15' }))).rejects.toMatchObject({ code: 'not_on_list' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(spy).not.toHaveBeenCalled()
  })
})
