// B9-34 (SSP-01): useShoppingActions gains changeTick / changeExtraTick, and a tick keeps the client id its caller chose (the tick flow
// needs it to Undo or Change that one addition, and B9-54 will queue the same id).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'

const api = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn() }))
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
  api.tick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 500 })
  api.tickExtra.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 2000 })
  api.changeTick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, quantity: 300 })
  api.changeExtraTick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, quantity: 300 })
})

describe('useShoppingActions: changeTick', () => {
  it('sends the change and refreshes Stock and the list (an amount moved in Stock)', async () => {
    const { result, keys } = setup()
    const out = await act(() => result.current.changeTick({ ingredientId: 9, to: '2026-11-15', quantity: 300, shopId: 1, clientUuid: 'u-1' }))
    expect(api.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: '2026-11-15', quantity: 300, shopId: 1, clientUuid: 'u-1' })
    expect(out).toEqual({ ticked: true, lotId: 5, quantity: 300 })
    expect(keys()).toContain('stock')
    await waitFor(() => expect(keys()).toContain('shopping'))
  })

  it('0 (Take back) refreshes Stock too: the Lot\'s rest is gone', async () => {
    const { result, keys } = setup()
    await act(() => result.current.changeTick({ ingredientId: 9, to: '2026-11-15', quantity: 0 }))
    expect(keys()).toContain('stock')
  })

  it('a refusal (409 not_by_hand) rejects with the ApiError and refreshes nothing', async () => {
    api.changeTick.mockRejectedValue(new ApiError(409, 'not_by_hand', 'A Scan added that.'))
    const { result, keys } = setup()
    await expect(act(() => result.current.changeTick({ ingredientId: 9, to: '2026-11-15', quantity: 0 }))).rejects.toBeInstanceOf(ApiError)
    expect(keys()).toEqual([])
  })
})

describe('useShoppingActions: changeExtraTick', () => {
  it('changes an extra\'s tick and refreshes Stock and the list', async () => {
    const { result, keys } = setup()
    await act(() => result.current.changeExtraTick(4, 300))
    expect(api.changeExtraTick).toHaveBeenCalledExactlyOnceWith(4, 300)
    expect(keys()).toContain('stock')
  })
})

describe('useShoppingActions: the client id of a tick', () => {
  it('keeps the one the caller sends (the tick flow Undoes and Changes that addition by it)', async () => {
    const { result } = setup()
    await act(() => result.current.tick({ ingredientId: 9, to: '2026-11-15', quantity: 500, shopId: 1, clientUuid: 'chosen-1' }))
    expect(api.tick).toHaveBeenCalledWith(expect.objectContaining({ clientUuid: 'chosen-1' }))
  })

  it('makes a fresh one when the caller sends none (as before)', async () => {
    const { result } = setup()
    await act(() => result.current.tick({ ingredientId: 9, to: '2026-11-15', quantity: 500 }))
    expect(api.tick).toHaveBeenCalledWith(expect.objectContaining({ clientUuid: expect.stringMatching(/^[0-9a-f-]{36}$/) }))
  })

  it('returns the server\'s answer, `added` included', async () => {
    const { result } = setup()
    expect(await act(() => result.current.tick({ ingredientId: 9, to: '2026-11-15', quantity: 500 }))).toMatchObject({ added: 500 })
  })
})
