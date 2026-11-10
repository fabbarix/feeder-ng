import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { Ingredient, MergePreview } from '../types'

const passata: Ingredient = { id: 4, name: 'passata', baseUnit: 'ml', shelfLifeDays: 5, conversions: [{ unit: 'jar', toBase: 700 }] }
const puree: Ingredient = { id: 9, name: 'tomato puree', baseUnit: 'ml', shelfLifeDays: 9, conversions: [{ unit: 'jar', toBase: 680 }] }
const preview: MergePreview = {
  source: passata, target: puree, blocked: '', conversions: [], shelfLifeDays: null,
  conflicts: [{ kind: 'conversion', unit: 'jar', source: 700, target: 680 }, { kind: 'shelfLife', unit: '', source: 5, target: 9 }],
  sourceReferences: {}, targetReferences: {},
}
// vi.mock is hoisted above imports, so the mock fixture must be hoisted too.
const api = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), create: vi.fn(), patch: vi.fn(), remove: vi.fn(), setConversion: vi.fn(), removeConversion: vi.fn(),
  search: vi.fn(), mergePreview: vi.fn(), merge: vi.fn(),
}))
vi.mock('../api', () => ({ ingredientsApi: api }))

import { useIngredient } from './useIngredient'
import { type UseMergeFlow, useMergeFlow } from './useMergeFlow'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

describe('useMergeFlow after a merge (B11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue([passata, puree])
    api.mergePreview.mockResolvedValue({ ...preview, conflicts: [] })
    api.merge.mockResolvedValue(puree)
    api.get.mockResolvedValue(puree)
  })
  it('drops every cached query of the deleted source and never refetches it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    client.setQueryData(['ingredients', 4], passata)
    client.setQueryData(['ingredients', 9], puree)
    const { result } = renderHook(() => useMergeFlow(4), { wrapper: w })
    act(() => result.current.selectTarget(puree))
    await waitFor(() => expect(result.current.canMerge).toBe(true))
    api.mergePreview.mockClear()
    await act(async () => {
      await result.current.merge()
    })
    expect(client.getQueryCache().find({ queryKey: ['ingredients', 4] })).toBeUndefined()
    expect(client.getQueryCache().findAll({ queryKey: ['ingredients', 4], exact: false })).toEqual([])
    expect(api.get).not.toHaveBeenCalledWith(4)
    expect(api.mergePreview).not.toHaveBeenCalled()
  })
  it('still refreshes the target and the list', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useMergeFlow(4), { wrapper: w })
    act(() => result.current.selectTarget(puree))
    await waitFor(() => expect(result.current.canMerge).toBe(true))
    const spy = vi.spyOn(client, 'invalidateQueries')
    await act(async () => {
      await result.current.merge()
    })
    expect(spy).toHaveBeenCalled()
    expect(client.getQueryState(['ingredients', 9])?.isInvalidated ?? true).toBe(true)
  })
})

// Realistic screen: the source Ingredient page (detail + merge flow mounted) navigates to the survivor and unmounts.
describe('merge from a mounted source screen (B11)', () => {
  it('navigates to the survivor first and never refetches the removed source or its preview', async () => {
    let list = [passata, puree]
    api.list.mockImplementation(async () => list)
    api.get.mockImplementation(async (id: number) => (id === 4 ? passata : puree))
    api.mergePreview.mockResolvedValue({ ...preview, conflicts: [] })
    api.merge.mockImplementation(async () => {
      list = [puree] // after the merge the server list no longer has the source
      return puree
    })
    const navigate = vi.fn()
    let flow!: UseMergeFlow
    function SourceScreen() {
      useIngredient(4)
      flow = useMergeFlow(4)
      return null
    }
    function Screen() {
      const [route, setRoute] = useState(4)
      navigate.mockImplementation((id: number) => setRoute(id))
      return route === 4 ? <SourceScreen /> : null
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(4))
    act(() => flow.selectTarget(puree))
    await waitFor(() => expect(flow.canMerge).toBe(true))
    api.get.mockClear()
    api.mergePreview.mockClear()
    await act(async () => {
      // merge() takes an onMerged callback that runs right after the POST, before the source queries are dropped.
      await flow.merge((survivor: Ingredient) => navigate(survivor.id))
    })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(9))
    expect(api.get).not.toHaveBeenCalledWith(4)
    expect(api.mergePreview).not.toHaveBeenCalled()
    expect(client.getQueryCache().findAll({ queryKey: ['ingredients', 4] })).toEqual([])
  })
})

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
  it('reloads the preview when the server reports merge conflicts', async () => {
    const { result } = renderHook(() => useMergeFlow(4), { wrapper })
    act(() => result.current.selectTarget(puree))
    await waitFor(() => expect(result.current.preview).toBeDefined())
    act(() => result.current.answer('conversion:jar', 690))
    act(() => result.current.answer('shelfLife', null))
    api.mergePreview.mockClear()
    api.merge.mockRejectedValueOnce(new ApiError(409, 'merge_conflicts', 'changed'))
    await act(async () => {
      await expect(result.current.merge()).rejects.toThrow('changed')
    })
    await waitFor(() => expect(api.mergePreview).toHaveBeenCalledWith(4, 9))
  })
  it('reloads the preview on a base unit mismatch but not on other failures', async () => {
    const { result } = renderHook(() => useMergeFlow(4), { wrapper })
    act(() => result.current.selectTarget(puree))
    await waitFor(() => expect(result.current.preview).toBeDefined())
    act(() => result.current.answer('conversion:jar', 690))
    act(() => result.current.answer('shelfLife', null))
    api.mergePreview.mockClear()
    api.merge.mockRejectedValueOnce(new ApiError(500, 'server_error', 'boom'))
    await act(async () => {
      await expect(result.current.merge()).rejects.toThrow('boom')
    })
    expect(api.mergePreview).not.toHaveBeenCalled()
    api.merge.mockRejectedValueOnce(new ApiError(409, 'base_unit_mismatch', 'units differ'))
    await act(async () => {
      await expect(result.current.merge()).rejects.toThrow('units differ')
    })
    await waitFor(() => expect(api.mergePreview).toHaveBeenCalledWith(4, 9))
  })
})
