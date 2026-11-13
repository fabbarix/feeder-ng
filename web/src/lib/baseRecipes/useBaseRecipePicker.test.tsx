import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, summaryJSON, wrapper } from './test-utils'
import { useBaseRecipePicker } from './useBaseRecipePicker'

const bech = summaryJSON({ id: 2, name: 'Béchamel' })
const roux = summaryJSON({ id: 1, name: 'Roux', yield: 300, yieldUnit: 'g' })
const lasagne = { id: 20, name: 'Lasagne', baseRecipe: false, archived: false, yield: 4, yieldUnit: null }

describe('useBaseRecipePicker', () => {
  it('fetches the Base recipes and the plannable Recipes and ranks them against the line', async () => {
    const api = mockApi({ 'GET /api/recipes?kind=base': [roux, bech], 'GET /api/recipes': [lasagne] })
    const { result } = renderHook(() => useBaseRecipePicker({ lineName: 'béchamel' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows.base.map((r) => r.kind === 'base' && r.name)).toEqual(['Béchamel', 'Roux'])
    expect(result.current.rows.create).toBeNull()
    expect(api.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(['GET /api/recipes', 'GET /api/recipes?kind=base'])
  })

  it('searches: the typed query filters and offers a new Base recipe', async () => {
    mockApi({ 'GET /api/recipes?kind=base': [roux, bech], 'GET /api/recipes': [] })
    const { result } = renderHook(() => useBaseRecipePicker({ lineName: 'béchamel' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.setQuery('stock'))
    expect(result.current.query).toBe('stock')
    expect(result.current.rows.base).toEqual([])
    expect(result.current.rows.create).toMatchObject({ kind: 'new', name: 'Stock' })
  })

  it('leaves the edited Recipe out and blocks every Recipe that calls for it, through other Base recipes', async () => {
    // Editing Roux; Béchamel calls for Roux; Lasagne calls for Béchamel. Linking a Roux line to either would make a cycle.
    mockApi({
      'GET /api/recipes?kind=base': [roux, bech],
      'GET /api/recipes': [lasagne],
      'GET /api/recipes/1': { ...roux, usedBy: [{ id: 2, name: 'Béchamel' }] },
      'GET /api/recipes/2': { ...bech, usedBy: [{ id: 20, name: 'Lasagne' }] },
      'GET /api/recipes/20': { ...lasagne, usedBy: [] },
    })
    const { result } = renderHook(() => useBaseRecipePicker({ recipeId: 1, lineName: 'béchamel' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows.base.some((r) => r.kind === 'base' && r.id === 1)).toBe(false)
    expect(result.current.rows.base[0]).toMatchObject({ id: 2, disabled: true, reason: 'Béchamel already calls for this Recipe' })
    act(() => result.current.setQuery('lasagne'))
    expect(result.current.rows.plannable[0]).toMatchObject({ id: 20, disabled: true, reason: 'Lasagne already calls for this Recipe' })
  })

  it('says so when the lists cannot be loaded', async () => {
    mockApi({})
    const { result } = renderHook(() => useBaseRecipePicker({ lineName: 'x' }), { wrapper })
    await waitFor(() => expect(result.current.error).toBe('The Base recipes could not be loaded.'))
  })
})
