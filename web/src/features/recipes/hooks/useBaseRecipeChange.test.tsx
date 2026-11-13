import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, summaryJSON, wrapper } from '../../../lib/baseRecipes/test-utils'
import { useBaseRecipeChange } from './useBaseRecipeChange'

const plan = { plannedMeals: [{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', pinned: true, bought: true }], slotRules: [{}], leftovers: 1, preferences: 0 }

describe('useBaseRecipeChange: the switch on a saved Recipe (design §3.6, P6)', () => {
  it('makes no request for a Recipe that is not saved yet', async () => {
    const api = mockApi({})
    const { result } = renderHook(() => useBaseRecipeChange({}), { wrapper })
    let out = ''
    await act(async () => { out = await result.current.turnOn({ name: 'Béchamel', yield: 1, yieldUnit: 'l' }) })
    expect(out).toBe('done')
    expect(api.calls).toEqual([])
  })

  it('asks in a dialog that names what goes; Cancel leaves the Recipe plannable', async () => {
    const api = mockApi({ 'POST /api/recipes/4/to-base?dryRun=1': plan })
    const { result } = renderHook(() => useBaseRecipeChange({ recipeId: 4 }), { wrapper })
    let out: Promise<string> = Promise.resolve('')
    act(() => { out = result.current.turnOn({ name: 'Pesto', yield: 4, yieldUnit: 'portion' }) })
    expect(await screen.findByRole('dialog', { name: 'Turn Pesto into a Base recipe?' })).toBeInTheDocument()
    expect(screen.getByText(/Tue 10 Nov Dinner \(Main, Pinned, Bought\)/)).toBeInTheDocument()
    expect(screen.getByText('1 Slot Rule that names it is removed.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await out).toBe('cancelled')
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes/4/to-base?dryRun=1'])
  })

  it('Confirm applies the change with the Yield and hands the Recipe back', async () => {
    const onConverted = vi.fn()
    const api = mockApi({ 'POST /api/recipes/4/to-base?dryRun=1': plan, 'POST /api/recipes/4/to-base': summaryJSON({ id: 4, name: 'Pesto', yield: 4, yieldUnit: 'portion' }) })
    const { result } = renderHook(() => useBaseRecipeChange({ recipeId: 4, onConverted }), { wrapper })
    let out: Promise<string> = Promise.resolve('')
    act(() => { out = result.current.turnOn({ name: 'Pesto', yield: 4, yieldUnit: 'portion' }) })
    await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
    expect(await out).toBe('done')
    expect(api.callsTo('POST', '/api/recipes/4/to-base')[0]?.body).toEqual({ yield: 4, yieldUnit: 'portion' })
    expect(onConverted).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
  })

  it('refuses turning a Ready Meal into a Base recipe in words', async () => {
    mockApi({ 'POST /api/recipes/4/to-base?dryRun=1': refusal(422, 'validation_failed', { field: 'readyMeal', reason: 'base_recipe_ready_meal' }) })
    const { result } = renderHook(() => useBaseRecipeChange({ recipeId: 4 }), { wrapper })
    let out = ''
    await act(async () => { out = await result.current.turnOn({ name: 'Lasagne pack', yield: 2, yieldUnit: 'portion' }) })
    expect(out).toBe('failed')
    expect(result.current.error).toBe('A Ready Meal cannot be a Base recipe.')
  })
})

describe('useBaseRecipeChange: the switch off (to-plannable)', () => {
  it('turns a Base recipe back with its Yield', async () => {
    const api = mockApi({ 'POST /api/recipes/2/to-plannable': summaryJSON({ id: 2, baseRecipe: false, yieldUnit: null, yield: 4 }) })
    const { result } = renderHook(() => useBaseRecipeChange({ recipeId: 2 }), { wrapper })
    let out = ''
    await act(async () => { out = await result.current.turnOff({ name: 'Béchamel', yield: 4 }) })
    expect(out).toBe('done')
    expect(api.callsTo('POST', '/api/recipes/2/to-plannable')[0]?.body).toEqual({ yield: 4 })
  })

  it('is refused while Recipes call for it, naming them', async () => {
    mockApi({ 'POST /api/recipes/2/to-plannable': refusal(409, 'base_recipe_in_use', { usedBy: [{ id: 1, name: 'Lasagne' }, { id: 3, name: 'Moussaka' }] }) })
    const { result } = renderHook(() => useBaseRecipeChange({ recipeId: 2 }), { wrapper })
    let out = ''
    await act(async () => { out = await result.current.turnOff({ name: 'Béchamel', yield: 4 }) })
    expect(out).toBe('failed')
    expect(result.current.error).toBe('Béchamel is used in Lasagne and Moussaka')
  })

  it('names a plain Ingredient that already has the name', async () => {
    mockApi({ 'POST /api/recipes/2/to-plannable': refusal(409, 'ingredient_name_taken', { ingredient: { id: 5, name: 'béchamel' } }) })
    const { result } = renderHook(() => useBaseRecipeChange({ recipeId: 2 }), { wrapper })
    await act(async () => { await result.current.turnOff({ name: 'Béchamel', yield: 4 }) })
    expect(result.current.error).toBe('An Ingredient named béchamel already exists. Merge or rename it first.')
  })

  it('makes no request for a Recipe that is not saved yet', async () => {
    const api = mockApi({})
    const { result } = renderHook(() => useBaseRecipeChange({}), { wrapper })
    await act(async () => { await result.current.turnOff({ name: 'x', yield: 1 }) })
    expect(api.calls).toEqual([])
  })
})
