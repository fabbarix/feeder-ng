// B9-43 (SSP-09): useUnsortedFromList(list): the count behind "Put away 17 Stock Lots". It reads the Stock Lots (stockApi.lots) ONLY while the
// list is complete (the complete tile is its one consumer), and gives lib/unsorted unsortedFromList; 0 until the Lots have loaded.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLot } from '../../stock/testData'
import { makeGarlic, makeList, makeTick } from '../testData'

const stock = vi.hoisted(() => ({ lots: vi.fn() }))
vi.mock('../../stock/api', () => ({ stockApi: stock }))

import { useUnsortedFromList } from './useUnsortedFromList'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const complete = makeList({ today: '2026-11-15', complete: true, lines: [makeGarlic({ ticked: true, quantity: 0, tick: makeTick() })] })

beforeEach(() => {
  stock.lots.mockReset().mockResolvedValue({ today: '2026-11-15', lots: [makeLot({ id: 1, ingredientId: 9, purchased: '2026-11-15', storagePlaceId: null, source: 'scan' }), makeLot({ id: 2, ingredientId: 9, purchased: '2026-11-15', storagePlaceId: 3, source: 'scan' })] })
})

describe('useUnsortedFromList', () => {
  it('is 0 first, then the number of this list\'s Lots that are Not sorted', async () => {
    const { result } = renderHook(() => useUnsortedFromList(complete), { wrapper })
    expect(result.current).toBe(0)
    await waitFor(() => expect(result.current).toBe(1))
    expect(stock.lots).toHaveBeenCalledTimes(1)
  })

  it('reads nothing while the list is not complete', async () => {
    const { result } = renderHook(() => useUnsortedFromList({ ...complete, complete: false }), { wrapper })
    await new Promise((r) => setTimeout(r, 30))
    expect(stock.lots).not.toHaveBeenCalled()
    expect(result.current).toBe(0)
  })

  it('a failed read leaves the count at 0 (the tile then offers no Put away; it never breaks the Shop)', async () => {
    stock.lots.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useUnsortedFromList(complete), { wrapper })
    await waitFor(() => expect(stock.lots).toHaveBeenCalled())
    expect(result.current).toBe(0)
  })
})
