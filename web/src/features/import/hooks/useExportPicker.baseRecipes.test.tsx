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

// ---- round 2: the look-ups are cached per Recipe, a level at a time in parallel, and the list stays while it re-reads ----
describe('useExportPicker, Also exports (round 2)', () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const withClient = (c: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={c}>{children}</QueryClientProvider>
  const listed = [
    { id: 1, name: 'Lasagne', imageUrl: '', archived: false },
    { id: 2, name: 'Moussaka', imageUrl: '', archived: false },
  ]
  const graph: Record<number, { name: string; calls: Array<{ id: number; name: string }> }> = {
    1: { name: 'Lasagne', calls: [{ id: 10, name: 'Béchamel' }] },
    2: { name: 'Moussaka', calls: [{ id: 11, name: 'Pesto' }] },
    10: { name: 'Béchamel', calls: [] },
    11: { name: 'Pesto', calls: [] },
  }
  /** recipeCalls that waits for release(id): shows what was started without being answered. */
  function gated() {
    const started: number[] = []
    const gates = new Map<number, () => void>()
    api.recipeCalls.mockImplementation(
      (id: number) =>
        new Promise((resolve) => {
          started.push(id)
          gates.set(id, () => resolve(graph[id]))
        }),
    )
    return { started, release: (...ids: number[]) => ids.forEach((id) => gates.get(id)?.()) }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    api.recipes.mockResolvedValue(listed)
    api.recipeCalls.mockImplementation(async (id: number) => graph[id])
  })

  it('caches each Recipe\'s calls under [\'recipes\', id, \'calls\']', async () => {
    const c = client()
    const { result } = renderHook(() => useExportPicker(), { wrapper: withClient(c) })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(result.current.also).toEqual([{ id: 10, name: 'Béchamel' }]))
    expect(c.getQueryData(['recipes', 1, 'calls'])).toEqual(graph[1])
    expect(c.getQueryData(['recipes', 10, 'calls'])).toEqual(graph[10])
  })

  it('a second tick does not read again a Recipe already read', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper: withClient(client()) })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(result.current.also).toHaveLength(1))
    act(() => result.current.toggle(2))
    await waitFor(() => expect(result.current.also.map((b) => b.name)).toEqual(['Béchamel', 'Pesto']))
    const asked = api.recipeCalls.mock.calls.map((c) => c[0] as number).sort((a, b) => a - b)
    expect(asked).toEqual([1, 2, 10, 11]) // each once
  })

  it('unticking and ticking again reads nothing again', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper: withClient(client()) })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(result.current.also).toHaveLength(1))
    act(() => result.current.toggle(1))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(result.current.also).toHaveLength(1))
    expect(api.recipeCalls.mock.calls.filter((c) => c[0] === 1)).toHaveLength(1)
  })

  it('reads the Recipes of one level in parallel: all the selected ones, then all the Base recipes they call for', async () => {
    const g = gated()
    const { result } = renderHook(() => useExportPicker(), { wrapper: withClient(client()) })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.selectAll())
    await waitFor(() => expect([...g.started].sort()).toEqual([1, 2])) // both asked before either is answered
    g.release(1, 2)
    await waitFor(() => expect([...g.started].sort((a, b) => a - b)).toEqual([1, 2, 10, 11])) // the next level, together
    g.release(10, 11)
    await waitFor(() => expect(result.current.also.map((b) => b.name)).toEqual(['Béchamel', 'Pesto']))
  })

  it('keeps the previous list while it reads again after a change of selection', async () => {
    const { result } = renderHook(() => useExportPicker(), { wrapper: withClient(client()) })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    act(() => result.current.toggle(1))
    await waitFor(() => expect(result.current.also).toEqual([{ id: 10, name: 'Béchamel' }]))
    const g = gated()
    act(() => result.current.toggle(2))
    await waitFor(() => expect(g.started).toContain(2))
    expect(result.current.also).toEqual([{ id: 10, name: 'Béchamel' }]) // not emptied while Moussaka is read
    g.release(2)
    await waitFor(() => expect(g.started).toContain(11))
    expect(result.current.also).toEqual([{ id: 10, name: 'Béchamel' }])
    g.release(11)
    await waitFor(() => expect(result.current.also.map((b) => b.name)).toEqual(['Béchamel', 'Pesto']))
  })
})
