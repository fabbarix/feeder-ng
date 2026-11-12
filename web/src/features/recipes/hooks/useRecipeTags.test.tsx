// TG-RW: useRecipeTags = useTags (by name, live) + useTagLookup (by key) for the Recipes screens.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tagsApi } from '../../../lib/tags/api'
import type { Tag } from '../../../lib/tags/types'
import { useRecipeTags } from './useRecipeTags'

vi.mock('../../../lib/tags/api', () => ({ tagsApi: { list: vi.fn() } }))
const api = vi.mocked(tagsApi)
const tag = (id: number, name: string, colour: string, recipes = 1): Tag => ({ id, name, key: name.toLowerCase(), colour, recipes, slotRules: 0, varietyRule: false })

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

beforeEach(() => {
  vi.resetAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useRecipeTags', () => {
  it('known lists every Tag with its Recipe count, by name whatever order the server answers in', async () => {
    api.list.mockResolvedValue([tag(2, 'sweet', 'plum', 4), tag(1, 'Roast', 'tomato', 2)])
    const { result } = renderHook(() => useRecipeTags(), { wrapper })
    await waitFor(() => expect(result.current.known).toHaveLength(2))
    expect(result.current.known).toEqual([{ name: 'Roast', recipes: 2 }, { name: 'sweet', recipes: 4 }])
  })
  it('colourOf finds the colour by key: another case or spacing of the name still matches', async () => {
    api.list.mockResolvedValue([tag(1, 'Fish pie', 'sky')])
    const { result } = renderHook(() => useRecipeTags(), { wrapper })
    await waitFor(() => expect(result.current.colourOf('fish pie')).toBe('sky'))
    expect(result.current.colourOf('  FISH   Pie ')).toBe('sky')
  })
  it('colourOf is undefined for a Tag that is not saved, and before the Tags have loaded', async () => {
    api.list.mockResolvedValue([tag(1, 'roast', 'tomato')])
    const { result } = renderHook(() => useRecipeTags(), { wrapper })
    expect(result.current.colourOf('roast')).toBeUndefined()
    await waitFor(() => expect(result.current.colourOf('roast')).toBe('tomato'))
    expect(result.current.colourOf('zebra')).toBeUndefined()
  })
  it('passes an unknown colour id through (the chip renders it neutral)', async () => {
    api.list.mockResolvedValue([tag(1, 'roast', 'chartreuse')])
    const { result } = renderHook(() => useRecipeTags(), { wrapper })
    await waitFor(() => expect(result.current.colourOf('roast')).toBe('chartreuse'))
  })
  it('a recolour elsewhere shows once the [tags] cache is refreshed (the `tags` event does exactly that)', async () => {
    api.list.mockResolvedValue([tag(1, 'roast', 'tomato')])
    const { result } = renderHook(() => useRecipeTags(), { wrapper })
    await waitFor(() => expect(result.current.colourOf('roast')).toBe('tomato'))
    api.list.mockResolvedValue([tag(1, 'roast', 'teal')])
    await act(() => client.invalidateQueries({ queryKey: ['tags'] }))
    await waitFor(() => expect(result.current.colourOf('roast')).toBe('teal'))
  })
  it('is empty and undefined while the Tags fail to load', async () => {
    api.list.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useRecipeTags(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(result.current.known).toEqual([])
    expect(result.current.colourOf('roast')).toBeUndefined()
  })
})
