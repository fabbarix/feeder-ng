// H5: a merge offer between Ingredients of different kinds (H2: merge-preview blocked "kind_differs", merge 409 "kind_differs") is
// refused in words and merges nothing.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, refusal, wrapper } from './test-utils'
import { useLinkCandidates } from './useLinkCandidates'

const opts = () => ({ baseRecipeId: 3, baseName: 'Béchamel', baseIngredientId: 30, onDone: vi.fn() })
const base = {
  'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [candidateJSON({ lineId: 2, recipeId: 11, recipeName: 'Lasagne' })] },
  'POST /api/recipes/3/link': { linked: [2], mergeOffer: [{ ingredientId: 5, name: 'béchamel', stockLots: 0, products: 0 }] },
}
const offered = async (extra: Record<string, unknown>) => {
  const api = mockApi({ ...base, ...extra })
  const hook = renderHook(() => useLinkCandidates(opts()), { wrapper })
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  act(() => hook.result.current.toggle(2))
  await act(() => hook.result.current.link())
  return { ...hook, api }
}
const WORDS = 'béchamel and Béchamel are not both food or both Supplies, so they cannot be merged.'

describe('useLinkCandidates: kind_differs', () => {
  it('does not merge when the preview is blocked as kind_differs; it says why and stays on the offer', async () => {
    const { result, api } = await offered({ 'GET /api/ingredients/5/merge-preview?into=30': { blocked: 'kind_differs', conflicts: [] } })
    await act(() => result.current.merge())
    expect(api.callsTo('POST', '/api/ingredients/5/merge')).toEqual([])
    expect(result.current.mergeIssue).toBe(WORDS)
    expect(result.current.step).toBe('merge')
  })
  it('says the same when the merge itself answers 409 kind_differs', async () => {
    const { result } = await offered({
      'GET /api/ingredients/5/merge-preview?into=30': { blocked: '', conflicts: [] },
      'POST /api/ingredients/5/merge': refusal(409, 'kind_differs'),
    })
    await act(() => result.current.merge())
    expect(result.current.mergeIssue).toBe(WORDS)
    expect(result.current.step).toBe('merge')
  })
})
