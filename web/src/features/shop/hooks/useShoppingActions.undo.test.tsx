// Beta.8 (undo): Undo of a tick takes back the Stock the tick added (ADR 0019), so the screens that show Stock refresh
// after an untick, the Shop screen's and the Scan screen's To get Undo alike (both go through useShoppingActions).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'

const api = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn() }))
vi.mock('../api', () => ({ shopApi: api }))

import { useShoppingActions } from './useShoppingActions'

function setup() {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])
  return { ...renderHook(() => useShoppingActions(), { wrapper: Wrapper }), keys }
}

beforeEach(() => {
  api.untick.mockReset().mockResolvedValue(undefined)
  api.untickExtra.mockReset().mockResolvedValue(undefined)
})

describe('useShoppingActions: Undo of a tick takes back Stock', () => {
  it('refreshes Stock after untick, not only the list', async () => {
    const { result, keys } = setup()
    await act(() => result.current.untick(2, '2026-11-15'))
    expect(keys()).toContain('stock')
  })

  it('refreshes Stock after untickExtra', async () => {
    const { result, keys } = setup()
    await act(() => result.current.untickExtra(4))
    expect(keys()).toContain('stock')
  })

  it('a failed untick rejects and refreshes nothing', async () => {
    api.untick.mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const { result, keys } = setup()
    await expect(act(() => result.current.untick(2, '2026-11-15'))).rejects.toBeInstanceOf(ApiError)
    expect(keys()).not.toContain('stock')
  })
})
