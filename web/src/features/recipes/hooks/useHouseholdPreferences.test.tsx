import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { ToastProvider } from '../../../ui'
import type { MemberPreferences } from '../types'

const h = vi.hoisted(() => ({
  api: { preferences: vi.fn(), setRecipeState: vi.fn(), setIngredientExclusion: vi.fn() },
  members: [
    { id: 1, name: 'Anna', colour: '#fff', avatar: '', portionFactor: 1, userId: 10 },
    { id: 2, name: 'Ben', colour: '#fff', avatar: '', portionFactor: 1, userId: null },
  ],
  me: { id: 10, isAdmin: true } as { id: number; isAdmin: boolean } | null,
  handlers: new Map<string, () => void>(),
}))
vi.mock('../api', () => ({ recipesApi: h.api }))
vi.mock('../../settings/hooks/useMembers', () => ({ useMembers: () => ({ members: h.members, isPending: false, isError: false }) }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: h.me, isLoading: false }) }))
vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({
    subscribe: (topic: string, handler: () => void) => {
      h.handlers.set(topic, handler)
      return () => h.handlers.delete(topic)
    },
    onReconnect: () => () => {},
    close: () => {},
  }),
}))

import { useHouseholdPreferences } from './useHouseholdPreferences'

const store: Record<number, MemberPreferences> = {}
const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
const setup = async () => {
  const hook = renderHook(() => useHouseholdPreferences(), { wrapper })
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
  return hook
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('EventSource', class {})
  h.handlers.clear()
  h.me = { id: 10, isAdmin: true }
  store[1] = { memberId: 1, recipes: { '3': 'dislike' }, excludedIngredients: [] }
  store[2] = { memberId: 2, recipes: { '3': 'favourite' }, excludedIngredients: [7] }
  h.api.preferences.mockImplementation(async (id: number) => structuredClone(store[id]))
})

describe('useHouseholdPreferences: reading', () => {
  it('makes one GET per Member with an explicit memberId, under ["recipe-preferences", memberId]', async () => {
    const { result } = await setup()
    expect(h.api.preferences).toHaveBeenCalledWith(1)
    expect(h.api.preferences).toHaveBeenCalledWith(2)
    expect(h.api.preferences).toHaveBeenCalledTimes(2)
    expect(result.current.prefsByMember[1]).toEqual(store[1])
    expect(result.current.prefsByMember[2]).toEqual(store[2])
  })
  it('gives the Members, the signed-in User\'s id and whether they are an Admin', async () => {
    const { result } = await setup()
    expect(result.current.members.map((m) => m.name)).toEqual(['Anna', 'Ben'])
    expect(result.current.meUserId).toBe(10)
    expect(result.current.isAdmin).toBe(true)
  })
  it('reports isLoading until the preferences are in, and isError when one Member\'s load fails', async () => {
    h.api.preferences.mockImplementation(async (id: number) => {
      if (id === 2) throw new ApiError(500, 'internal', 'boom')
      return structuredClone(store[id])
    })
    const { result } = renderHook(() => useHouseholdPreferences(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.prefsByMember[1]).toEqual(store[1])
    expect(result.current.prefsByMember[2]).toBeUndefined()
  })
  it('refetch loads every Member again', async () => {
    const { result } = await setup()
    act(() => result.current.refetch())
    await waitFor(() => expect(h.api.preferences).toHaveBeenCalledTimes(4))
  })
})

describe('useHouseholdPreferences: toggleRecipe', () => {
  it('replaces the state with the tapped one and sends the explicit memberId', async () => {
    h.api.setRecipeState.mockResolvedValue({ ...store[1], recipes: { '3': 'favourite' } })
    const { result } = await setup()
    await act(() => result.current.toggleRecipe(1, 3, 'favourite'))
    expect(h.api.setRecipeState).toHaveBeenCalledWith(3, 'favourite', 1)
  })
  it('clears the state when the tapped one is the current one (nextState)', async () => {
    h.api.setRecipeState.mockResolvedValue({ ...store[1], recipes: {} })
    const { result } = await setup()
    await act(() => result.current.toggleRecipe(1, 3, 'dislike'))
    expect(h.api.setRecipeState).toHaveBeenCalledWith(3, 'none', 1)
  })
  it('acts on that Member only', async () => {
    h.api.setRecipeState.mockResolvedValue({ ...store[2], recipes: { '3': 'exclusion' } })
    const { result } = await setup()
    await act(() => result.current.toggleRecipe(2, 3, 'exclusion'))
    expect(result.current.prefsByMember[1]!.recipes).toEqual({ '3': 'dislike' })
    expect(result.current.prefsByMember[2]!.recipes).toEqual({ '3': 'exclusion' })
  })
  it('shows the change at once, before the save returns', async () => {
    let finish: (p: MemberPreferences) => void = () => {}
    h.api.setRecipeState.mockReturnValue(new Promise<MemberPreferences>((r) => (finish = r)))
    const { result } = await setup()
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.toggleRecipe(1, 3, 'exclusion')
    })
    await waitFor(() => expect(result.current.prefsByMember[1]!.recipes['3']).toBe('exclusion'))
    await act(async () => {
      finish({ memberId: 1, recipes: { '3': 'exclusion' }, excludedIngredients: [] })
      await done
    })
    expect(result.current.prefsByMember[1]!.recipes['3']).toBe('exclusion')
  })
  it('rolls back and says so in a Toast when the save fails, without rejecting', async () => {
    h.api.setRecipeState.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    const { result } = await setup()
    await act(() => result.current.toggleRecipe(1, 3, 'favourite'))
    expect(result.current.prefsByMember[1]!.recipes).toEqual({ '3': 'dislike' })
    expect(await screen.findByText("Couldn't save Anna's Favourite. Try again.")).toBeInTheDocument()
  })
  it('names the tapped state in the failure Toast', async () => {
    h.api.setRecipeState.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    const { result } = await setup()
    await act(() => result.current.toggleRecipe(2, 3, 'dislike'))
    expect(await screen.findByText("Couldn't save Ben's Dislike. Try again.")).toBeInTheDocument()
  })
  it('does nothing for a Member whose preferences are not loaded', async () => {
    const { result } = await setup()
    await act(() => result.current.toggleRecipe(99, 3, 'favourite'))
    expect(h.api.setRecipeState).not.toHaveBeenCalled()
  })
})

describe('useHouseholdPreferences: toggleIngredient', () => {
  it('excludes an Ingredient for the named Member, then allows it again', async () => {
    h.api.setIngredientExclusion.mockResolvedValue({ ...store[1], excludedIngredients: [7] })
    const { result } = await setup()
    await act(() => result.current.toggleIngredient(1, 7))
    expect(h.api.setIngredientExclusion).toHaveBeenLastCalledWith(7, true, 1)
    expect(result.current.prefsByMember[1]!.excludedIngredients).toEqual([7])
    h.api.setIngredientExclusion.mockResolvedValue({ ...store[1], excludedIngredients: [] })
    await act(() => result.current.toggleIngredient(1, 7))
    expect(h.api.setIngredientExclusion).toHaveBeenLastCalledWith(7, false, 1)
    expect(result.current.prefsByMember[1]!.excludedIngredients).toEqual([])
  })
  it('uses each Member\'s own list (Ben already excludes 7: his toggle allows it)', async () => {
    h.api.setIngredientExclusion.mockResolvedValue({ ...store[2], excludedIngredients: [] })
    const { result } = await setup()
    await act(() => result.current.toggleIngredient(2, 7))
    expect(h.api.setIngredientExclusion).toHaveBeenCalledWith(7, false, 2)
    expect(result.current.prefsByMember[1]!.excludedIngredients).toEqual([])
  })
  it('rolls back and says so in a Toast when the save fails', async () => {
    h.api.setIngredientExclusion.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    const { result } = await setup()
    await act(() => result.current.toggleIngredient(1, 7))
    expect(result.current.prefsByMember[1]!.excludedIngredients).toEqual([])
    expect(await screen.findByText(/Couldn't save Anna's/)).toBeInTheDocument()
  })
})

describe('useHouseholdPreferences: live updates', () => {
  it('subscribes to the "recipes" topic and loads every Member again on an event', async () => {
    await setup()
    expect(h.handlers.has('recipes')).toBe(true)
    store[2] = { memberId: 2, recipes: {}, excludedIngredients: [] }
    act(() => h.handlers.get('recipes')!())
    await waitFor(() => expect(h.api.preferences).toHaveBeenCalledTimes(4))
  })
  it('shows the new preferences after the refetch', async () => {
    const { result } = await setup()
    store[2] = { memberId: 2, recipes: { '3': 'exclusion' }, excludedIngredients: [7, 8] }
    act(() => h.handlers.get('recipes')!())
    await waitFor(() => expect(result.current.prefsByMember[2]!.excludedIngredients).toEqual([7, 8]))
  })
  it('stops listening when unmounted', async () => {
    const { unmount } = await setup()
    unmount()
    expect(h.handlers.has('recipes')).toBe(false)
  })
})
