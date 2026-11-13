import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, refusal, wrapper } from './test-utils'
import { useLinkCandidates } from './useLinkCandidates'

const opts = (over = {}) => ({ baseRecipeId: 3, baseName: 'Béchamel', baseIngredientId: 30, onDone: vi.fn(), ...over })
const lines = [
  candidateJSON({ lineId: 1, recipeId: 10, recipeName: 'Cannelloni', quantity: 2, unit: 'cup', linkable: false, reason: 'unit_unconvertible' }),
  candidateJSON({ lineId: 2, recipeId: 11, recipeName: 'Lasagne' }),
  candidateJSON({ lineId: 3, recipeId: 12, recipeName: 'Moussaka', archived: true, quantity: 300 }),
]
const base = { 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines } }
const load = async (o = opts()) => {
  const hook = renderHook(() => useLinkCandidates(o), { wrapper })
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return { ...hook, o }
}

describe('useLinkCandidates: the list (never silent, nothing ticked)', () => {
  it('loads the candidates, words the heading by distinct Recipes and ticks nothing', async () => {
    mockApi(base)
    const { result } = await load()
    expect(result.current.step).toBe('pick')
    expect(result.current.heading).toBe('3 Recipes use an Ingredient named béchamel. Link them to this Base recipe?')
    expect(result.current.rows.map((r) => r.checked)).toEqual([false, false, false])
    expect(result.current.linkLabel).toBe('Link')
    expect(result.current.canLink).toBe(false)
  })

  it('ticks rows, counts them in the label, and ignores the disabled row', async () => {
    mockApi(base)
    const { result } = await load()
    act(() => result.current.toggle(2))
    act(() => result.current.toggle(3))
    act(() => result.current.toggle(1))
    expect(result.current.linkLabel).toBe('Link 2')
    expect(result.current.canLink).toBe(true)
    expect(result.current.rows.map((r) => r.checked)).toEqual([false, true, true])
  })

  it('Not now links nothing and finishes', async () => {
    const api = mockApi(base)
    const { result, o } = await load()
    act(() => result.current.notNow())
    expect(o.onDone).toHaveBeenCalledOnce()
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('says it could not load the list', async () => {
    mockApi({})
    const hook = renderHook(() => useLinkCandidates(opts()), { wrapper })
    await waitFor(() => expect(hook.result.current.status).toBe('error'))
  })
})

describe('useLinkCandidates: link, Undo and the merge offer', () => {
  it('links exactly the ticked lines, in row order, then toasts "Linked 2 Recipes" with Undo', async () => {
    const api = mockApi({ ...base, 'POST /api/recipes/3/link': { linked: [2, 3], mergeOffer: [] } })
    const { result, o } = await load()
    act(() => result.current.toggle(3))
    act(() => result.current.toggle(2))
    await act(() => result.current.link())
    expect(api.callsTo('POST', '/api/recipes/3/link')[0]?.body).toEqual({ lineIds: [2, 3] })
    expect(await screen.findByText('Linked 2 Recipes')).toBeInTheDocument()
    expect(o.onDone).toHaveBeenCalledOnce() // no merge offer: the sheet is done
  })

  it('Undo re-points them all back', async () => {
    const api = mockApi({ ...base, 'POST /api/recipes/3/link': { linked: [2, 3], mergeOffer: [] }, 'POST /api/recipes/3/unlink': undefined })
    const { result } = await load()
    act(() => result.current.toggle(2))
    act(() => result.current.toggle(3))
    await act(() => result.current.link())
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/3/unlink')[0]?.body).toEqual({ lineIds: [2, 3] }))
  })

  it('goes on to the merge offer when the server offers one; Keep it merges nothing and finishes', async () => {
    const api = mockApi({ ...base, 'POST /api/recipes/3/link': { linked: [2], mergeOffer: [{ ingredientId: 5, name: 'béchamel', stockLots: 1, products: 0 }] } })
    const { result, o } = await load()
    act(() => result.current.toggle(2))
    await act(() => result.current.link())
    expect(result.current.step).toBe('merge')
    expect(result.current.offer).toMatchObject({ ingredientId: 5, title: 'béchamel is no longer on any Recipe. Merge it into Béchamel (Base recipe)?' })
    expect(o.onDone).not.toHaveBeenCalled()
    act(() => result.current.keep())
    expect(o.onDone).toHaveBeenCalledOnce()
    expect(api.calls.filter((c) => c.path.includes('/merge')).length).toBe(0)
  })

  it('Merge previews, then merges the old Ingredient into the Base recipe\'s Ingredient', async () => {
    const api = mockApi({
      ...base,
      'POST /api/recipes/3/link': { linked: [2], mergeOffer: [{ ingredientId: 5, name: 'béchamel', stockLots: 1, products: 0 }] },
      'GET /api/ingredients/5/merge-preview?into=30': { blocked: '', conflicts: [] },
      'POST /api/ingredients/5/merge': { id: 30 },
    })
    const { result, o } = await load()
    act(() => result.current.toggle(2))
    await act(() => result.current.link())
    await act(() => result.current.merge())
    expect(api.callsTo('POST', '/api/ingredients/5/merge')[0]?.body).toEqual({ into: 30 })
    expect(o.onDone).toHaveBeenCalledOnce()
  })

  it('does not merge when the Base Units differ; it says why and stays on the offer', async () => {
    const api = mockApi({
      ...base,
      'POST /api/recipes/3/link': { linked: [2], mergeOffer: [{ ingredientId: 5, name: 'béchamel', stockLots: 0, products: 0 }] },
      'GET /api/ingredients/5/merge-preview?into=30': { blocked: 'base_unit_mismatch', conflicts: [] },
    })
    const { result, o } = await load()
    act(() => result.current.toggle(2))
    await act(() => result.current.link())
    await act(() => result.current.merge())
    expect(api.callsTo('POST', '/api/ingredients/5/merge')).toEqual([])
    expect(result.current.mergeIssue).toBe('béchamel and Béchamel have different Base Units, so they cannot be merged.')
    expect(result.current.step).toBe('merge')
    expect(o.onDone).not.toHaveBeenCalled()
  })

  it('shows a refusal as words and keeps the ticks (nothing was linked)', async () => {
    mockApi({ ...base, 'POST /api/recipes/3/link': refusal(422, 'validation_failed', { field: 'lineIds', reason: 'not_a_candidate' }) })
    const { result } = await load()
    act(() => result.current.toggle(2))
    await act(() => result.current.link())
    expect(result.current.error).toBe('One of those lines can no longer be linked. Reopen the list.')
    expect(result.current.rows[1]?.checked).toBe(true)
  })
})
