import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'

const api = vi.hoisted(() => ({ spoiled: vi.fn(), throwOut: vi.fn(), keep: vi.fn() }))
vi.mock('../api', () => ({ stockApi: api }))

import { useSpoiledLots } from './useStock'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { Wrapper, spy }
}

beforeEach(() => {
  api.spoiled.mockReset().mockResolvedValue({ lots: [makeLot({ id: 3 })], today: '2026-11-09' })
  api.throwOut.mockReset().mockResolvedValue({ id: 1 })
  api.keep.mockReset().mockResolvedValue(makeLot({ id: 3 }))
})

describe('useSpoiledLots', () => {
  it('loads the spoiled lots', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useSpoiledLots(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.data?.[0]?.id).toBe(3)
  })

  it('exposes the household date the server sent', async () => {
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useSpoiledLots(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.today).toBe('2026-11-09')
  })

  it('throwOut calls the API and refreshes Stock', async () => {
    const { Wrapper, spy } = wrapper()
    const { result } = renderHook(() => useSpoiledLots(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    await act(() => result.current.throwOut(3))
    expect(api.throwOut).toHaveBeenCalledWith(3)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stock'] }))
  })

  it('keep calls the API and refreshes Stock', async () => {
    const { Wrapper, spy } = wrapper()
    const { result } = renderHook(() => useSpoiledLots(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    await act(() => result.current.keep(3))
    expect(api.keep).toHaveBeenCalledWith(3)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stock'] }))
  })
})
