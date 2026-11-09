import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ recipes: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useExportPicker } from './useExportPicker'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

describe('useExportPicker', () => {
  beforeEach(() => {
    api.recipes.mockResolvedValue([
      { id: 2, name: 'B', imageUrl: '', archived: false },
      { id: 1, name: 'A', imageUrl: '', archived: true },
      { id: 3, name: 'C', imageUrl: '', archived: false },
    ])
  })
  it('selects nothing at first, so there is nothing to download', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(3))
    expect(result.current.selected).toEqual([])
    expect(result.current.href).toBeNull()
  })
  it('toggles, selects all and clears', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(3))
    act(() => result.current.toggle(3))
    act(() => result.current.toggle(1))
    expect(result.current.href).toBe('/api/recipe-file/export?ids=1,3')
    act(() => result.current.selectAll())
    expect(result.current.href).toBe('/api/recipe-file/export?all=1')
    act(() => result.current.clear())
    expect(result.current.selected).toEqual([])
  })
})
