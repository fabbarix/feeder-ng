import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ updateLot: vi.fn(), deleteLot: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { useStockActions } from './useStock'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useStockActions(), { wrapper: Wrapper }), spy }
}

const keys = (spy: ReturnType<typeof setup>['spy']) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)

beforeEach(() => {
  api.updateLot.mockReset().mockResolvedValue({})
  api.deleteLot.mockReset().mockResolvedValue(undefined)
})

describe('useStockActions: editLot and deleteLot (beta.5)', () => {
  it('editLot patches the Lot and refreshes Stock and the zero-waste streak', async () => {
    const { result, spy } = setup()
    await result.current.editLot(5, { quantity: 650 })
    expect(api.updateLot).toHaveBeenCalledWith(5, { quantity: 650 })
    expect(keys(spy)).toEqual(expect.arrayContaining([['stock'], ['today', 'streak']]))
  })

  it('deleteLot deletes the Lot and refreshes Stock and the zero-waste streak', async () => {
    const { result, spy } = setup()
    await result.current.deleteLot(5)
    expect(api.deleteLot).toHaveBeenCalledWith(5)
    expect(keys(spy)).toEqual(expect.arrayContaining([['stock'], ['today', 'streak']]))
  })

  it('a failed edit rejects and refreshes nothing', async () => {
    api.updateLot.mockRejectedValue(new Error('422'))
    const { result, spy } = setup()
    await expect(result.current.editLot(5, { quantity: 1 })).rejects.toThrow('422')
    expect(spy).not.toHaveBeenCalled()
  })
})
