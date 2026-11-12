import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { match, plan, prompt, recipe } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ open: vi.fn(), plan: vi.fn(), confirm: vi.fn(), discard: vi.fn(), agentPrompt: vi.fn(), recipes: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useImportReview } from './useImportReview'

const notReady = plan({
  ready: false,
  ingredients: [match({ key: 'onion', status: 'conflict', resolved: false })],
  unitPrompts: [prompt({ key: 'onion', ingredient: 'onion', unit: 'piece' })],
  recipes: [recipe({ status: 'conflict', resolved: false })],
})
const ready = plan({ ready: true })
const empty = { ingredients: [], conversions: [], recipes: [], courses: [] }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useImportReview(), { wrapper }), spy }
}

describe('useImportReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.open.mockResolvedValue({ id: 'r1', plan: notReady })
    api.plan.mockResolvedValue({ id: 'r1', plan: ready })
    api.confirm.mockResolvedValue({ recipes: [{ index: 0, id: 1, name: 'A', action: 'created' }], ingredientsCreated: 2, conversionsAdded: 0 })
    api.discard.mockResolvedValue(undefined)
  })

  it('starts at the source step', () => {
    const { result } = setup()
    expect(result.current.phase).toBe('source')
    expect(result.current.plan).toBeUndefined()
    expect(result.current.decisions).toEqual(empty)
  })

  it('opens a review and moves to the reviewing step', async () => {
    const { result } = setup()
    await act(() => result.current.open('{}'))
    expect(api.open).toHaveBeenCalledWith('{}')
    expect(result.current.phase).toBe('reviewing')
    expect(result.current.plan).toEqual(notReady)
  })

  it('stays at the source step with the error when the file is refused', async () => {
    api.open.mockRejectedValue(new ApiError(422, 'invalid_recipe_file', 'x', { errors: [{ path: '$.recipes', message: 'min 1' }] }))
    const { result } = setup()
    await act(() => result.current.open('{}'))
    expect(result.current.phase).toBe('source')
    expect(result.current.error).toEqual({ kind: 'schema', errors: [{ path: '$.recipes', message: 'min 1' }] })
    expect(result.current.busy).toBe(false)
  })

  it('sends every answer to the server and shows the new plan', async () => {
    const { result } = setup()
    await act(() => result.current.open('{}'))
    act(() => result.current.chooseExisting('onion', 5))
    await waitFor(() => expect(result.current.plan).toEqual(ready))
    expect(api.plan).toHaveBeenLastCalledWith('r1', { ingredients: [{ key: 'onion', action: 'use', ingredientId: 5 }], conversions: [], recipes: [], courses: [] })
    act(() => result.current.answerConversion('onion', 'piece', 150))
    act(() => result.current.chooseRecipeAction(0, 'replace'))
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(3))
    expect(api.plan).toHaveBeenLastCalledWith('r1', {
      ingredients: [{ key: 'onion', action: 'use', ingredientId: 5 }],
      conversions: [{ key: 'onion', unit: 'piece', toBase: 150 }],
      recipes: [{ index: 0, action: 'replace' }],
      courses: [],
    })
  })

  it('lets the last answer win when answers overlap', async () => {
    let first!: (v: unknown) => void
    api.plan.mockReturnValueOnce(new Promise((r) => (first = r)))
    api.plan.mockResolvedValueOnce({ id: 'r1', plan: plan({ ready: true, warnings: [{ path: 'p', code: 'c', message: 'second' }] }) })
    const { result } = setup()
    await act(() => result.current.open('{}'))
    act(() => result.current.chooseExisting('a', 1))
    act(() => result.current.chooseExisting('b', 2))
    await waitFor(() => expect(result.current.plan?.warnings[0]?.message).toBe('second'))
    await act(async () => first({ id: 'r1', plan: notReady }))
    expect(result.current.plan?.warnings[0]?.message).toBe('second')
  })

  it('confirms with the current answers, finishes and refreshes Recipes, Ingredients and Tags', async () => {
    const { result, spy } = setup()
    await act(() => result.current.open('{}'))
    act(() => result.current.chooseRecipeAction(0, 'skip'))
    await waitFor(() => expect(result.current.plan).toEqual(ready))
    await act(() => result.current.confirm())
    expect(api.confirm).toHaveBeenCalledWith('r1', { ingredients: [], conversions: [], recipes: [{ index: 0, action: 'skip' }], courses: [] })
    expect(result.current.phase).toBe('done')
    expect(result.current.result?.ingredientsCreated).toBe(2)
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
    expect(keys).toEqual(expect.arrayContaining(['["recipes"]', '["ingredients"]', '["tags"]']))
  })

  it('shows the server plan again when Confirm is refused as not ready', async () => {
    api.confirm.mockRejectedValue(new ApiError(422, 'import_not_ready', 'x', { plan: notReady }))
    const { result } = setup()
    await act(() => result.current.open('{}'))
    await act(() => result.current.confirm())
    expect(result.current.phase).toBe('reviewing')
    expect(result.current.plan).toEqual(notReady)
  })

  it('flags a stale review', async () => {
    api.confirm.mockRejectedValue(new ApiError(409, 'import_stale', 'x'))
    const { result } = setup()
    await act(() => result.current.open('{}'))
    await act(() => result.current.confirm())
    expect(result.current.stale).toBe(true)
    expect(result.current.phase).toBe('reviewing')
  })

  it('reset discards the server-side review and returns to the source step', async () => {
    const { result } = setup()
    await act(() => result.current.open('{}'))
    await act(() => result.current.reset())
    expect(api.discard).toHaveBeenCalledWith('r1')
    expect(result.current.phase).toBe('source')
    expect(result.current.plan).toBeUndefined()
    expect(result.current.decisions).toEqual(empty)
  })
})
