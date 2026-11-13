import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, wrapper } from './test-utils'
import { useLinkCandidates } from './useLinkCandidates'

// BR-D round 4: the Base Unit comes from the candidates answer (top-level baseUnit), and the merge offer counts Exclusions.
const opts = () => ({ baseRecipeId: 3, baseName: 'Béchamel', baseIngredientId: 30, onDone: vi.fn() })
const cup = candidateJSON({ lineId: 1, recipeId: 10, recipeName: 'Cannelloni', quantity: 2, unit: 'cup', linkable: false, reason: 'unit_unconvertible' })
const lasagne = candidateJSON({ lineId: 2, recipeId: 11, recipeName: 'Lasagne' })

describe('useLinkCandidates: the unit from the server', () => {
  it('words an unconvertible reason with the answer\'s baseUnit, with no baseUnit option', async () => {
    mockApi({ 'GET /api/recipes/3/link-candidates': { baseUnit: 'g', lines: [cup, lasagne] } })
    const { result } = renderHook(() => useLinkCandidates(opts()), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.rows[0]?.reason).toBe('cup cannot be converted to g yet: link it from Cannelloni')
  })
})

describe('useLinkCandidates: the merge offer counts Exclusions', () => {
  it('the offer body names the Exclusions that move', async () => {
    mockApi({
      'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [lasagne] },
      'POST /api/recipes/3/link': { linked: [2], mergeOffer: [{ ingredientId: 5, name: 'béchamel', stockLots: 2, products: 1, exclusions: 3 }] },
    })
    const { result } = renderHook(() => useLinkCandidates(opts()), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.toggle(2))
    await act(async () => { await result.current.link() })
    expect(result.current.step).toBe('merge')
    expect(result.current.offer?.body).toBe('Its 2 Stock Lots, 1 Product and 3 Exclusions move too.')
  })
})
