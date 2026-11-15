// B9-43 (SSP-13): useChangePrice({ shopId, today }): "Change the Price" of the Line's suggested Product at a Shop.
//   open(entry)  needs entry.details.product (a Line with a Product); sets `target` and `product` {id, name, pack: {amount: packSize, unit: baseUnit}},
//                and loads `last` from productsApi.latestPrice(productId, shopId) ({ cents: priceCents, date }); null while loading or none.
//                The Shop is the picked one; with Any Shop (null) it is the Shop of the priced fallback's Price (details.priceShopId); with
//                neither, open does nothing (the Line sheet hides the button then).
//   save(entry)  productsApi.recordPrice(productId, priceBodyOf(entry, {shopId, date: today})); then the Shopping List refreshes (its estimate
//                changes) and the sheet closes. A failure keeps the sheet open with `error` in words and records nothing else.
//   close(entry) a valid typed Price is saved (as Escape does in Scan); an empty or invalid one just closes.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { lineEntry } from '../lib/lines'
import { makeLine, makeOnion } from '../testData'

const products = vi.hoisted(() => ({ latestPrice: vi.fn(), recordPrice: vi.fn() }))
vi.mock('../../products/api', () => ({ productsApi: products }))
const refresh = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../lib/liveRefresh', () => ({ liveRefreshFor: () => refresh }))

import { useChangePrice } from './useChangePrice'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
const onion = lineEntry(makeOnion(), 'USD', 'metric')
const typed = { basis: 'pack' as const, cents: 349, packCents: 349, perKgCents: null }
const none = { basis: 'pack' as const, cents: null, packCents: null, perKgCents: null }
const setup = (shopId: number | null = 1) => renderHook(() => useChangePrice({ shopId, today: '2026-11-15' }), { wrapper })

beforeEach(() => {
  products.latestPrice.mockReset().mockResolvedValue({ id: 3, productId: 21, shopId: 1, date: '2026-11-14', priceCents: 299, pricePerKgCents: null, pricePerKgDerived: false })
  products.recordPrice.mockReset().mockResolvedValue({ id: 4 })
  refresh.request.mockReset().mockResolvedValue(undefined)
})

describe('useChangePrice', () => {
  it('open(entry) names the Product and its pack, then loads the last Price at the Shop', async () => {
    const { result } = setup()
    act(() => result.current.open(onion))
    expect(result.current.target).toBe(onion)
    expect(result.current.product).toEqual({ id: 21, name: 'Onion pack', pack: { amount: 6, unit: 'piece' } })
    expect(result.current.last).toBeNull()
    await waitFor(() => expect(result.current.last).toEqual({ cents: 299, date: '2026-11-14' }))
    expect(products.latestPrice).toHaveBeenCalledWith(21, 1)
  })

  it('no Price at that Shop yet: last stays null', async () => {
    products.latestPrice.mockResolvedValue(null)
    const { result } = setup()
    act(() => result.current.open(onion))
    await waitFor(() => expect(products.latestPrice).toHaveBeenCalled())
    expect(result.current.last).toBeNull()
  })

  it('with Any Shop the Price is at the Shop of the priced fallback (Coop, id 1)', async () => {
    const { result } = setup(null)
    act(() => result.current.open(onion))
    await waitFor(() => expect(products.latestPrice).toHaveBeenCalledWith(21, 1))
    await act(() => result.current.save(typed))
    expect(products.recordPrice).toHaveBeenCalledWith(21, { shopId: 1, date: '2026-11-15', priceCents: 349 })
  })

  it('with Any Shop and a last-bought pack (no Shop of its Price) it does nothing', () => {
    const { result } = setup(null)
    act(() => result.current.open(lineEntry(makeLine(), 'USD', 'metric')))
    expect(result.current.target).toBeNull()
    expect(products.latestPrice).not.toHaveBeenCalled()
  })

  it('a Line with no Product does nothing', () => {
    const { result } = setup()
    act(() => result.current.open(lineEntry(makeOnion({ pack: null }), 'USD', 'metric')))
    expect(result.current.target).toBeNull()
  })

  it('save records the Price at the picked Shop today, refreshes the list and closes', async () => {
    const { result } = setup()
    act(() => result.current.open(onion))
    await act(() => result.current.save(typed))
    expect(products.recordPrice).toHaveBeenCalledExactlyOnceWith(21, { shopId: 1, date: '2026-11-15', priceCents: 349 })
    expect(refresh.request).toHaveBeenCalled()
    expect(result.current.target).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('a failed save keeps the sheet open and says so; nothing is refreshed', async () => {
    products.recordPrice.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    const { result } = setup()
    act(() => result.current.open(onion))
    await act(() => result.current.save(typed))
    expect(result.current.target).toBe(onion)
    expect(result.current.error).toBeTruthy()
    expect(refresh.request).not.toHaveBeenCalled()
  })

  it('close with a valid typed Price saves it; with nothing valid it just closes', async () => {
    const { result } = setup()
    act(() => result.current.open(onion))
    await act(async () => result.current.close(typed))
    expect(products.recordPrice).toHaveBeenCalledTimes(1)
    expect(result.current.target).toBeNull()
    act(() => result.current.open(onion))
    await act(async () => result.current.close(none))
    expect(products.recordPrice).toHaveBeenCalledTimes(1)
    expect(result.current.target).toBeNull()
  })

  it('saving nothing valid (Save is refused by the keypad, but a stray call) records nothing', async () => {
    const { result } = setup()
    act(() => result.current.open(onion))
    await act(() => result.current.save(none))
    expect(products.recordPrice).not.toHaveBeenCalled()
  })
})
