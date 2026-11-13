// Supplies (household-items.md 4.2, ADR 0017 point 7; H6): Used up is the existing DELETE or PATCH of a Lot. It is not waste, so it
// never calls Throw out.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ updateLot: vi.fn(), deleteLot: vi.fn(), throwOut: vi.fn(), keep: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { useStockActions } from './useStock'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useStockActions(), { wrapper: Wrapper }), spy }
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset().mockResolvedValue(undefined)
})

describe('useStockActions().usedUp(lot, used?)', () => {
  it('the whole Lot (no amount) deletes it', async () => {
    const { result, spy } = setup()
    await result.current.usedUp({ id: 31, quantity: 6 })
    expect(api.deleteLot).toHaveBeenCalledWith(31)
    expect(api.updateLot).not.toHaveBeenCalled()
    expect((spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey))).toEqual(expect.arrayContaining([['stock']]))
  })
  it('the whole quantity, or more, deletes it too', async () => {
    const { result } = setup()
    await result.current.usedUp({ id: 31, quantity: 6 }, 6)
    expect(api.deleteLot).toHaveBeenCalledWith(31)
  })
  it('part of it patches the Lot with the quantity that remains, and sends nothing else', async () => {
    const { result } = setup()
    await result.current.usedUp({ id: 31, quantity: 6 }, 2)
    expect(api.updateLot).toHaveBeenCalledWith(31, { quantity: 4 })
    expect(api.deleteLot).not.toHaveBeenCalled()
  })
  it('never records waste: no Throw out, no Keep', async () => {
    const { result } = setup()
    await result.current.usedUp({ id: 31, quantity: 6 })
    await result.current.usedUp({ id: 32, quantity: 6 }, 1)
    expect(api.throwOut).not.toHaveBeenCalled()
    expect(api.keep).not.toHaveBeenCalled()
  })
  it('a failure rejects, so the screen shows its error toast', async () => {
    api.deleteLot.mockRejectedValue(new Error('boom'))
    const { result } = setup()
    await expect(result.current.usedUp({ id: 31, quantity: 6 })).rejects.toThrow('boom')
  })
})
