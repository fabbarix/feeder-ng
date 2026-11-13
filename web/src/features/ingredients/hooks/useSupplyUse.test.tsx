// H9 (household-items.md section 4.11): the quick Use flow of the Supplies list. Pinned hook API:
//
//   const { request, sheet, confirm, closeSheet, busyId } = useSupplyUse()
//   request(supply, stock)   a piece Supply: POST .../use {quantity: 1} at once; g or ml: opens the sheet (nothing is sent)
//   sheet                    null, or { supply, stock, packSize: number | null, packLoading: boolean }; packSize comes from
//                            GET /api/products/last-bought?ingredient=<id> (404 = null)
//   confirm(quantity)        POST .../use {quantity}, closes the sheet
//   closeSheet()             closes it without a request
//   busyId                   the Supply id while its Use (or Undo) is in flight, else null
// After a Use or an Undo it refetches Stock (invalidates ['stock']) and toasts: "Used 1 Toilet paper" with an "Undo" action,
// "Put back 1 Toilet paper" after Undo. A refusal toasts an error (use_exceeds_stock: "There is less in Stock than that",
// anything else "Could not use that. Try again."; a failed Undo "Could not put that back. Try again."). Offline it sends
// nothing and toasts the error "Using a Supply needs a connection" (the stock module does not queue offline).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, refusal } from '../../../lib/baseRecipes/test-utils'
import { dishSoapJSON, toiletPaperJSON } from '../supply.test-helper'
import type { SupplyUseResult } from '../types'

const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui', async (orig) => ({ ...(await orig<typeof import('../../../ui')>()), useToast: () => toast }))
vi.mock('./useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { useSupplyUse } from './useSupplyUse'

const paperUsed: SupplyUseResult = {
  ingredientId: 22, name: 'toilet paper', baseUnit: 'piece', quantity: 1, total: 3,
  taken: [{ lotId: 11, quantity: 1, purchased: '2026-11-01', storagePlaceId: 3, productId: 5, shopId: 6 }],
}
const soapUsed: SupplyUseResult = {
  ingredientId: 21, name: 'dish soap', baseUnit: 'ml', quantity: 250, total: 550,
  taken: [{ lotId: 31, quantity: 250, purchased: '2026-11-02', storagePlaceId: null, productId: null, shopId: null }],
}
const pack = { id: 9, name: 'Soap 500 ml', ingredientId: 21, ingredientName: 'dish soap', baseUnit: 'ml', packSize: 500, image: '', imageUrl: '' }

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
const setOnline = (online: boolean) => vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online)

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  toast.show.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('useSupplyUse: a Supply counted in pieces', () => {
  it('uses one at once and toasts "Used 1 Toilet paper" with an Undo action', async () => {
    const api = mockApi({ 'POST /api/stock/ingredients/22/use': paperUsed })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 4))
    await waitFor(() => expect(toast.show).toHaveBeenCalled())
    expect(api.callsTo('POST', '/api/stock/ingredients/22/use').map((c) => c.body)).toEqual([{ quantity: 1 }])
    expect(toast.show).toHaveBeenCalledWith('Used 1 Toilet paper', expect.objectContaining({ actionLabel: 'Undo', onAction: expect.any(Function) }))
    expect(result.current.sheet).toBeNull()
  })
  it('refetches Stock after a Use', async () => {
    mockApi({ 'POST /api/stock/ingredients/22/use': paperUsed })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 4))
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stock'] })))
  })
  it('is busy for that Supply only while the request is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    const gate = new Promise((r) => (release = r))
    mockApi({ 'POST /api/stock/ingredients/22/use': async () => (await gate, paperUsed) })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    expect(result.current.busyId).toBeNull()
    act(() => result.current.request(toiletPaperJSON, 4))
    await waitFor(() => expect(result.current.busyId).toBe(22))
    release(null)
    await waitFor(() => expect(result.current.busyId).toBeNull())
  })
  it('Undo sends back exactly the Lots that were taken, then toasts "Put back 1 Toilet paper"', async () => {
    const api = mockApi({
      'POST /api/stock/ingredients/22/use': paperUsed,
      'POST /api/stock/ingredients/22/use/undo': { ...paperUsed, total: 4 },
    })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 4))
    await waitFor(() => expect(toast.show).toHaveBeenCalledTimes(1))
    spy.mockClear()
    await act(async () => toast.show.mock.calls[0][1].onAction())
    expect(api.callsTo('POST', '/api/stock/ingredients/22/use/undo').map((c) => c.body)).toEqual([{ taken: paperUsed.taken }])
    expect(toast.show).toHaveBeenLastCalledWith('Put back 1 Toilet paper', expect.not.objectContaining({ actionLabel: expect.anything() }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stock'] }))
  })
  it('says so when Undo fails', async () => {
    mockApi({ 'POST /api/stock/ingredients/22/use': paperUsed, 'POST /api/stock/ingredients/22/use/undo': refusal(500, 'internal') })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 4))
    await waitFor(() => expect(toast.show).toHaveBeenCalledTimes(1))
    await act(async () => toast.show.mock.calls[0][1].onAction())
    expect(toast.show).toHaveBeenLastCalledWith('Could not put that back. Try again.', expect.objectContaining({ status: 'error' }))
  })
  it('sends nothing when there is no Stock', () => {
    const api = mockApi({})
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 0))
    expect(api.calls).toEqual([])
    expect(toast.show).not.toHaveBeenCalled()
  })
})

describe('useSupplyUse: a Supply counted in g or ml', () => {
  it('opens the sheet with the pack size of the Product last bought and sends nothing yet', async () => {
    const api = mockApi({ 'GET /api/products/last-bought?ingredient=21': pack })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(dishSoapJSON, 800))
    expect(result.current.sheet).toEqual({ supply: dishSoapJSON, stock: 800, packSize: null, packLoading: true })
    await waitFor(() => expect(result.current.sheet?.packSize).toBe(500))
    expect(result.current.sheet?.packLoading).toBe(false)
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })
  it('has no pack size when nothing was bought (404)', async () => {
    mockApi({ 'GET /api/products/last-bought?ingredient=21': refusal(404, 'not_found') })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(dishSoapJSON, 800))
    await waitFor(() => expect(result.current.sheet?.packLoading).toBe(false))
    expect(result.current.sheet?.packSize).toBeNull()
  })
  it('closeSheet closes it without a request', async () => {
    const api = mockApi({ 'GET /api/products/last-bought?ingredient=21': pack })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(dishSoapJSON, 800))
    act(() => result.current.closeSheet())
    expect(result.current.sheet).toBeNull()
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })
  it('confirm sends the amount, closes the sheet and toasts "Used 250 ml of Dish soap" with Undo', async () => {
    const api = mockApi({ 'GET /api/products/last-bought?ingredient=21': pack, 'POST /api/stock/ingredients/21/use': soapUsed })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(dishSoapJSON, 800))
    await act(async () => result.current.confirm(250))
    expect(api.callsTo('POST', '/api/stock/ingredients/21/use').map((c) => c.body)).toEqual([{ quantity: 250 }])
    expect(result.current.sheet).toBeNull()
    expect(toast.show).toHaveBeenCalledWith('Used 250 ml of Dish soap', expect.objectContaining({ actionLabel: 'Undo' }))
  })
})

describe('useSupplyUse: refusals and offline', () => {
  it('toasts "There is less in Stock than that" for use_exceeds_stock and refetches Stock', async () => {
    mockApi({ 'POST /api/stock/ingredients/22/use': refusal(422, 'use_exceeds_stock') })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 4))
    await waitFor(() => expect(toast.show).toHaveBeenCalled())
    expect(toast.show).toHaveBeenCalledWith('There is less in Stock than that', expect.objectContaining({ status: 'error' }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stock'] }))
    expect(result.current.busyId).toBeNull()
  })
  it('toasts a plain failure for anything else', async () => {
    mockApi({ 'POST /api/stock/ingredients/22/use': refusal(500, 'internal') })
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 4))
    await waitFor(() => expect(toast.show).toHaveBeenCalled())
    expect(toast.show).toHaveBeenCalledWith('Could not use that. Try again.', expect.objectContaining({ status: 'error' }))
  })
  it('needs a connection: offline it sends nothing and says so', () => {
    setOnline(false)
    const api = mockApi({})
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(toiletPaperJSON, 4))
    expect(api.calls).toEqual([])
    expect(toast.show).toHaveBeenCalledWith('Using a Supply needs a connection', expect.objectContaining({ status: 'error' }))
  })
  it('offline, a g or ml Supply does not open the sheet either', () => {
    setOnline(false)
    const api = mockApi({})
    const { result } = renderHook(() => useSupplyUse(), { wrapper })
    act(() => result.current.request(dishSoapJSON, 800))
    expect(result.current.sheet).toBeNull()
    expect(api.calls).toEqual([])
    expect(toast.show).toHaveBeenCalledWith('Using a Supply needs a connection', expect.objectContaining({ status: 'error' }))
  })
})
