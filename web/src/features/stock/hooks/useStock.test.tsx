import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLot, makeTotal } from '../testData'

const api = vi.hoisted(() => ({ totals: vi.fn(), lots: vi.fn(), spoiled: vi.fn(), throwOut: vi.fn(), keep: vi.fn(), addLot: vi.fn(), setTotal: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connection, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { useSpoiledLots, useStockLots, useStockTotals } from './useStock'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper, spy }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  sse.connectEvents.mockClear()
  sse.connection.subscribe.mockClear()
  sse.connection.close.mockClear()
  api.totals.mockReset().mockResolvedValue([makeTotal()])
  api.lots.mockReset().mockResolvedValue({ lots: [makeLot({ id: 5 })], today: '2026-11-09' })
  api.spoiled.mockReset().mockResolvedValue({ lots: [makeLot({ id: 3 })], today: '2026-11-09' })
})
afterEach(() => vi.unstubAllGlobals())

const hooks = {
  useStockTotals: () => useStockTotals(),
  'useStockLots (an Ingredient selected)': () => useStockLots(7),
  'useStockLots (nothing selected)': () => useStockLots(null),
  useSpoiledLots: () => useSpoiledLots(),
}

describe.each(Object.entries(hooks))('%s', (_name, useHook) => {
  it('subscribes to the shared `stock` topic and refetches Stock when it fires', () => {
    const { Wrapper, spy } = wrapper()
    renderHook(useHook, { wrapper: Wrapper })
    expect(sse.connection.subscribe).toHaveBeenCalledWith('stock', expect.any(Function))
    spy.mockClear()
    sse.handlers['stock']?.()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stock'] }))
  })

  it('refetches Stock after the stream reconnects and closes the connection on unmount', () => {
    const { Wrapper } = wrapper()
    const { unmount } = renderHook(useHook, { wrapper: Wrapper })
    expect(sse.connection.onReconnect).toHaveBeenCalled()
    unmount()
    expect(sse.connection.close).toHaveBeenCalled()
  })
})

describe('useStockLots', () => {
  it('returns the lots with the household date and server flags, untouched', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useStockLots(7), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.today).toBe('2026-11-09')
    expect(result.current.data?.[0]).toMatchObject({ id: 5, spoiled: true, useSoon: false })
    expect(api.lots).toHaveBeenCalledWith(7)
  })

  it('does not fetch while no Ingredient is selected', () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useStockLots(null), { wrapper: Wrapper })
    expect(api.lots).not.toHaveBeenCalled()
    expect(result.current.today).toBeUndefined()
  })
})

describe('useStock module', () => {
  it('no longer reads the device clock for go-off wording', async () => {
    const mod = await import('./useStock')
    expect('useToday' in mod).toBe(false)
  })
})
