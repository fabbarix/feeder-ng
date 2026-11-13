// BR-E: the Export picker says which Base recipes the export adds ("Also exports Béchamel (Base recipe)"). RED until useExportPicker walks the calls.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ recipes: vi.fn(), recipeCalls: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useExportPicker } from './useExportPicker'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

// importApi.recipeCalls(id) -> { name, calls: [{ id, name }] }: the Base recipe lines of GET /api/recipes/{id}.
const calls: Record<number, { name: string; calls: Array<{ id: number; name: string }> }> = {
  1: { name: 'Lasagne', calls: [{ id: 10, name: 'Béchamel' }] },
  2: { name: 'Salad', calls: [] },
  10: { name: 'Béchamel', calls: [{ id: 12, name: 'Roux' }] },
  12: { name: 'Roux', calls: [] },
}

describe('useExportPicker, Base recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.recipes.mockResolvedValue([
      { id: 1, name: 'Lasagne', imageUrl: '', archived: false },
      { id: 2, name: 'Salad', imageUrl: '', archived: false },
    ])
    api.recipeCalls.mockImplementation(async (id: number) => calls[id])
  })

  it('adds nothing while nothing is selected, and asks for nothing', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    expect(result.current.also).toEqual([])
    expect(api.recipeCalls).not.toHaveBeenCalled()
  })

  it('walks the Base recipes a selected Recipe calls for, transitively', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(result.current.also).toEqual([{ id: 10, name: 'Béchamel' }, { id: 12, name: 'Roux' }]))
    expect(api.recipeCalls).toHaveBeenCalledWith(1)
    expect(api.recipeCalls).toHaveBeenCalledWith(10)
    expect(api.recipeCalls).toHaveBeenCalledWith(12)
  })

  it('a Recipe with no Base recipe line adds nothing', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(2))
    await waitFor(() => expect(api.recipeCalls).toHaveBeenCalledWith(2))
    expect(result.current.also).toEqual([])
  })

  it('clearing the selection clears the list', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(result.current.also).toHaveLength(2))
    act(() => result.current.clear())
    expect(result.current.also).toEqual([])
  })

  it('keeps the download address as before (the server adds the Base recipes itself)', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    expect(result.current.href).toBe('/api/recipe-file/export?ids=1')
  })

  it('a failed look-up leaves the list empty and never blocks the download', async () => {
    api.recipeCalls.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(api.recipeCalls).toHaveBeenCalled())
    expect(result.current.also).toEqual([])
    expect(result.current.href).toBe('/api/recipe-file/export?ids=1')
  })
})
