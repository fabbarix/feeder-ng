// B9-29 (SAFE-09): the Throw out of one Lot in an Ingredient's own sheet (LotList, via useStockActions) can be undone exactly as the
// spoiled tile's: throwOut resolves with the waste record, and undoThrowOut(wasteId) undoes it and refreshes Stock, the streak and the board.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'

const api = vi.hoisted(() => ({ throwOut: vi.fn(), undoThrowOut: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))

import { useStockActions } from './useStock'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useStockActions(), { wrapper: Wrapper }), spy }
}

beforeEach(() => {
  api.throwOut.mockReset().mockResolvedValue({ id: 9, lotId: 3, quantity: 200, reason: 'spoiled' })
  api.undoThrowOut.mockReset().mockResolvedValue(makeLot({ id: 31 }))
})

describe('useStockActions Throw out and its Undo', () => {
  it('throwOut resolves with the waste record', async () => {
    const { result } = setup()
    let record: unknown
    await act(async () => {
      record = await result.current.throwOut(3)
    })
    expect(record).toEqual(expect.objectContaining({ id: 9 }))
  })
  it('undoThrowOut undoes it and refreshes Stock, the streak and the board', async () => {
    const { result, spy } = setup()
    await act(() => result.current.undoThrowOut(9).then(() => undefined))
    expect(api.undoThrowOut).toHaveBeenCalledWith(9)
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))
    expect(keys).toEqual(expect.arrayContaining(['["stock"]', '["today","streak"]', '["board"]']))
  })
})
