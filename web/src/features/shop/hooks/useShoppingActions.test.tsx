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
  return { ...renderHook(() => useShoppingActions(), { wrapper: Wrapper }), spy }
}

beforeEach(() => {
  api.tick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true })
  api.untick.mockReset().mockResolvedValue(undefined)
  api.addExtra.mockReset().mockResolvedValue({ id: 1 })
  api.deleteExtra.mockReset().mockResolvedValue(undefined)
  api.tickExtra.mockReset().mockResolvedValue({ ticked: true, lotId: null, created: false })
  api.untickExtra.mockReset().mockResolvedValue(undefined)
})

describe('useShoppingActions', () => {
  it('ticks by hand with a fresh client id and refreshes the list and Stock', async () => {
    const { result, spy } = setup()
    await act(() => result.current.tick({ ingredientId: 2, to: '2026-11-15', quantity: 1400, shopId: 1 }))
    expect(api.tick).toHaveBeenCalledWith({ ingredientId: 2, to: '2026-11-15', quantity: 1400, shopId: 1, clientUuid: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])
    expect(keys).toContain('shopping')
    expect(keys).toContain('stock')
  })

  it('uses a different client id for each tick', async () => {
    const { result } = setup()
    await act(() => result.current.tick({ ingredientId: 2, to: '2026-11-15', quantity: 1 }))
    await act(() => result.current.tick({ ingredientId: 3, to: '2026-11-15', quantity: 1 }))
    expect(api.tick.mock.calls[0]?.[0].clientUuid).not.toBe(api.tick.mock.calls[1]?.[0].clientUuid)
  })

  it('a tick that adds nothing leaves Stock alone', async () => {
    api.tick.mockResolvedValue({ ticked: true, lotId: null, created: false })
    const { result, spy } = setup()
    await act(() => result.current.tick({ ingredientId: 2, to: '2026-11-15', quantity: 0 }))
    expect(spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])).not.toContain('stock')
  })

  it('unticks, adds and deletes extras, and refreshes the list', async () => {
    const { result, spy } = setup()
    await act(() => result.current.untick(2, '2026-11-15'))
    await act(() => result.current.addExtra({ text: 'candles' }))
    await act(() => result.current.deleteExtra(4))
    await act(() => result.current.untickExtra(4))
    expect(api.untick).toHaveBeenCalledWith(2, '2026-11-15')
    expect(api.addExtra).toHaveBeenCalledWith({ text: 'candles' })
    expect(api.deleteExtra).toHaveBeenCalledWith(4)
    expect(api.untickExtra).toHaveBeenCalledWith(4)
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('a failed call rejects and refreshes nothing', async () => {
    api.addExtra.mockRejectedValue(new ApiError(422, 'validation_failed', 'bad'))
    const { result, spy } = setup()
    await expect(act(() => result.current.addExtra({ text: ' ' }))).rejects.toMatchObject({ code: 'validation_failed' })
    expect(spy).not.toHaveBeenCalled()
  })
})
