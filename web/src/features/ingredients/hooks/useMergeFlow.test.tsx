import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ingredient, MergePreview } from '../types'

const passata: Ingredient = { id: 4, name: 'passata', baseUnit: 'ml', shelfLifeDays: 5, conversions: [{ unit: 'jar', toBase: 700 }] }
const puree: Ingredient = { id: 9, name: 'tomato puree', baseUnit: 'ml', shelfLifeDays: 9, conversions: [{ unit: 'jar', toBase: 680 }] }
const preview: MergePreview = {
  source: passata, target: puree, blocked: '', conversions: [], shelfLifeDays: null,
  conflicts: [{ kind: 'conversion', unit: 'jar', source: 700, target: 680 }, { kind: 'shelfLife', unit: '', source: 5, target: 9 }],
  sourceReferences: {}, targetReferences: {},
}
const api = {
  list: vi.fn(), get: vi.fn(), create: vi.fn(), patch: vi.fn(), remove: vi.fn(), setConversion: vi.fn(), removeConversion: vi.fn(),
  search: vi.fn(), mergePreview: vi.fn(), merge: vi.fn(),
}
vi.mock('../api', () => ({ ingredientsApi: api }))

import { useMergeFlow } from './useMergeFlow'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

describe('useMergeFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue([passata, puree])
    api.mergePreview.mockResolvedValue(preview)
    api.merge.mockResolvedValue(puree)
  })
  it('loads the preview once a target is chosen and starts unresolved', async () => {
    const { result } = renderHook(() => useMergeFlow(4), { wrapper })
    expect(result.current.preview).toBeUndefined()
    act(() => result.current.selectTarget(puree))
    await waitFor(() => expect(result.current.preview).toEqual(preview))
    expect(api.mergePreview).toHaveBeenCalledWith(4, 9)
    expect(result.current.canMerge).toBe(false)
  })
  it('can merge only when every conflict is answered, and sends the answers', async () => {
    const { result } = renderHook(() => useMergeFlow(4), { wrapper })
    act(() => result.current.selectTarget(puree))
    await waitFor(() => expect(result.current.preview).toBeDefined())
    act(() => result.current.answer('conversion:jar', 690))
    expect(result.current.canMerge).toBe(false)
    act(() => result.current.answer('shelfLife', null))
    expect(result.current.canMerge).toBe(true)
    await act(async () => {
      await result.current.merge()
    })
    expect(api.merge).toHaveBeenCalledWith(4, { into: 9, resolutions: { conversions: { jar: 690 }, shelfLifeDays: null } })
  })
  it('never offers the source as a target', async () => {
    const { result } = renderHook(() => useMergeFlow(4), { wrapper })
    await waitFor(() => expect(result.current.candidates.map((c) => c.id)).toEqual([9]))
  })
  it('cannot merge a blocked preview', async () => {
    api.mergePreview.mockResolvedValue({ ...preview, blocked: 'base_unit_mismatch', conflicts: [] })
    const { result } = renderHook(() => useMergeFlow(4), { wrapper })
    act(() => result.current.selectTarget(puree))
    await waitFor(() => expect(result.current.preview).toBeDefined())
    expect(result.current.canMerge).toBe(false)
  })
})
