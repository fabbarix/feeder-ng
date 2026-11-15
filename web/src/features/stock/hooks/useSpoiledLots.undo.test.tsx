// B9-29 (SAFE-09, SSP-17): useSpoiledLots gives the screen what an Undo needs.
//   throwOut(lotId)               resolves with the waste record, so the toast's Undo knows which record to undo
//   keep(lotId, goodUntil?)       resolves with the kept Lot; a date is Change (the server says today without one)
//   undoThrowOut(wasteId)         POST /api/stock/waste/{id}/undo, then Stock, the zero-waste streak and the board refetch
//   undoKeep(lotId, goesOff)      puts the Lot's old go-off date back (PATCH {goesOff}); Keep has no inverse route, and the
//                                 date was past, which an edit allows (not before the Bought on date)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'

const api = vi.hoisted(() => ({ spoiled: vi.fn(), throwOut: vi.fn(), keep: vi.fn(), undoThrowOut: vi.fn(), updateLot: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))

import { useSpoiledLots } from './useStock'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper, spy }
}
const keysOf = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))

beforeEach(() => {
  api.spoiled.mockReset().mockResolvedValue({ lots: [makeLot({ id: 3 })], today: '2026-11-09' })
  api.throwOut.mockReset().mockResolvedValue({ id: 9, lotId: 3, quantity: 200, reason: 'spoiled' })
  api.keep.mockReset().mockResolvedValue(makeLot({ id: 3, goesOff: '2026-11-09', spoiled: false }))
  api.undoThrowOut.mockReset().mockResolvedValue(makeLot({ id: 31 }))
  api.updateLot.mockReset().mockResolvedValue(makeLot({ id: 3 }))
})

async function ready() {
  const { Wrapper, spy } = wrapper()
  const hook = renderHook(() => useSpoiledLots(), { wrapper: Wrapper })
  await waitFor(() => expect(hook.result.current.data).toBeDefined())
  return { ...hook, spy }
}

describe('useSpoiledLots, beta.9', () => {
  it('throwOut resolves with the waste record', async () => {
    const { result } = await ready()
    let record: unknown
    await act(async () => {
      record = await result.current.throwOut(3)
    })
    expect(record).toEqual(expect.objectContaining({ id: 9 }))
  })
  it('keep passes no date by default and the date for Change; it resolves with the Lot', async () => {
    const { result } = await ready()
    await act(async () => {
      await result.current.keep(3)
    })
    expect(api.keep).toHaveBeenLastCalledWith(3, undefined)
    let kept: unknown
    await act(async () => {
      kept = await result.current.keep(3, '2026-11-12')
    })
    expect(api.keep).toHaveBeenLastCalledWith(3, '2026-11-12')
    expect(kept).toEqual(expect.objectContaining({ id: 3 }))
  })
  it('undoThrowOut undoes the record and refreshes Stock, the streak and the board', async () => {
    const { result, spy } = await ready()
    spy.mockClear()
    await act(() => result.current.undoThrowOut(9).then(() => undefined))
    expect(api.undoThrowOut).toHaveBeenCalledWith(9)
    const keys = keysOf(spy)
    expect(keys).toContain('["stock"]')
    expect(keys).toContain('["today","streak"]')
    expect(keys).toContain('["board"]')
  })
  it('undoThrowOut rejects when the server refuses, so the Undo toast can say nothing was undone', async () => {
    api.undoThrowOut.mockRejectedValue(new Error('window over'))
    const { result } = await ready()
    await expect(result.current.undoThrowOut(9)).rejects.toThrow('window over')
  })
  it('undoKeep puts the old go-off date back and refreshes Stock and the streak', async () => {
    const { result, spy } = await ready()
    spy.mockClear()
    await act(() => result.current.undoKeep(3, '2026-10-08').then(() => undefined))
    expect(api.updateLot).toHaveBeenCalledWith(3, { goesOff: '2026-10-08' })
    expect(keysOf(spy)).toEqual(expect.arrayContaining(['["stock"]', '["today","streak"]']))
  })
})
