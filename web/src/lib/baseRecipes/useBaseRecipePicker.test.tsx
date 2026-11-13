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

  it('asks the server which Base recipes would make a cycle (?kind=base&for=) and disables them; it walks no usedBy (round 4)', async () => {
    // Editing Roux; Béchamel calls for Roux; Lasagne (plannable) calls for Béchamel. The server answers wouldCycle.
    const api = mockApi({
      'GET /api/recipes?kind=base&for=1': [{ ...roux, wouldCycle: true }, { ...bech, wouldCycle: true }, summaryJSON({ id: 3, name: 'Stock', wouldCycle: false })],
      'GET /api/recipes': [lasagne],
    })
    const { result } = renderHook(() => useBaseRecipePicker({ recipeId: 1, lineName: 'béchamel' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows.base.some((r) => r.kind === 'base' && r.id === 1)).toBe(false) // the Recipe itself is left out
    expect(result.current.rows.base[0]).toMatchObject({ id: 2, disabled: true, reason: 'Béchamel already calls for this Recipe' })
    expect(result.current.rows.base.find((r) => r.kind === 'base' && r.id === 3)).toMatchObject({ disabled: false })
    expect(api.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(['GET /api/recipes', 'GET /api/recipes?kind=base&for=1'])
    expect(api.calls.some((c) => /^\/api\/recipes\/\d+$/.test(c.path))).toBe(false)
  })

  it('never disables a plannable Recipe in the picker: the server marks only Base recipes, and a cycle through a convert is refused on the convert', async () => {
    mockApi({ 'GET /api/recipes?kind=base&for=1': [roux], 'GET /api/recipes': [lasagne] })
    const { result } = renderHook(() => useBaseRecipePicker({ recipeId: 1, lineName: 'lasagne' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows.plannable[0]).toMatchObject({ id: 20, disabled: false })
  })

  it('a new Recipe (no id) asks without for= (the Recipe being made cannot be called by anything)', async () => {
    const api = mockApi({ 'GET /api/recipes?kind=base': [roux, bech], 'GET /api/recipes': [] })
    const { result } = renderHook(() => useBaseRecipePicker({ lineName: 'béchamel' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.calls.map((c) => c.path)).toContain('/api/recipes?kind=base')
    expect(api.calls.some((c) => c.path.includes('for='))).toBe(false)
  })

  it('says so when the lists cannot be loaded', async () => {
    mockApi({})
    const { result } = renderHook(() => useBaseRecipePicker({ lineName: 'x' }), { wrapper })
    await waitFor(() => expect(result.current.error).toBe('The Base recipes could not be loaded.'))
  })
})
