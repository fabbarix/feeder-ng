import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, summaryJSON, wrapper } from '../../../lib/baseRecipes/test-utils'
import { useBaseRecipeChange } from './useBaseRecipeChange'

// BR-D round 4: to-base answers 409 base_recipe_take_over when the Recipe's name is an Ingredient's; the hook asks (takeOverAsk) and the turnOn
// promise stays open until the User answers (answerTakeOver) or cancels (cancelTakeOver).
const plan = { plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0 }
const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'pesto' }, recipes: [{ id: 1, name: 'Lasagne' }], stockLots: 2, convertible: true })
const input = { name: 'Pesto', yield: 4, yieldUnit: 'portion' }
const routes = (toBase: unknown = summaryJSON({ id: 4, name: 'Pesto', yield: 4, yieldUnit: 'portion' })) => ({
  'POST /api/recipes/4/to-base?dryRun=1': plan,
  'POST /api/recipes/4/to-base': toBase,
})
/** Starts turnOn, confirms the "Turn into a Base recipe" dialog, and waits for the ask. */
async function startAsked(hook: { result: { current: ReturnType<typeof useBaseRecipeChange> } }) {
  let out: Promise<string> = Promise.resolve('')
  act(() => { out = hook.result.current.turnOn(input) })
  await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
  await waitFor(() => expect(hook.result.current.takeOverAsk).not.toBeNull())
  return { p: out }
}

describe('useBaseRecipeChange: the take-over ask on to-base', () => {
  it('a 409 sets takeOverAsk (Recipes, Stock, convertible) and the turn-on stays open; nothing is converted yet', async () => {
    const api = mockApi({ ...routes(), 'POST /api/recipes/4/to-base': ask })
    const hook = renderHook(() => useBaseRecipeChange({ recipeId: 4 }), { wrapper })
    await startAsked(hook)
    expect(hook.result.current.takeOverAsk).toMatchObject({ ingredient: { id: 5, name: 'pesto' }, recipes: [{ id: 1, name: 'Lasagne' }], stockLots: 2, convertible: true })
    expect(api.callsTo('POST', '/api/recipes/4/to-base')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/recipes/4/to-base')[0]?.body).toEqual({ yield: 4, yieldUnit: 'portion' })
  })

  it('Yes asks again with takeOver true, hands the Recipe back and settles done', async () => {
    let first = true
    const onConverted = vi.fn()
    const api = mockApi({ ...routes(), 'POST /api/recipes/4/to-base': () => (first ? ((first = false), ask) : summaryJSON({ id: 4, name: 'Pesto', baseIngredientId: 5 })) })
    const hook = renderHook(() => useBaseRecipeChange({ recipeId: 4, onConverted }), { wrapper })
    const { p: out } = await startAsked(hook)
    await act(async () => { await hook.result.current.answerTakeOver(true) })
    expect(await out).toBe('done')
    expect(api.callsTo('POST', '/api/recipes/4/to-base')[1]?.body).toEqual({ yield: 4, yieldUnit: 'portion', takeOver: true })
    expect(onConverted).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
    expect(hook.result.current.takeOverAsk).toBeNull()
  })

  it('No asks again with takeOver false (the Recipe gets its own Ingredient)', async () => {
    let first = true
    const api = mockApi({ ...routes(), 'POST /api/recipes/4/to-base': () => (first ? ((first = false), ask) : summaryJSON({ id: 4, name: 'Pesto' })) })
    const hook = renderHook(() => useBaseRecipeChange({ recipeId: 4 }), { wrapper })
    const { p: out } = await startAsked(hook)
    await act(async () => { await hook.result.current.answerTakeOver(false) })
    expect(await out).toBe('done')
    expect(api.callsTo('POST', '/api/recipes/4/to-base')[1]?.body).toEqual({ yield: 4, yieldUnit: 'portion', takeOver: false })
  })

  it('Cancel settles cancelled and sends nothing more', async () => {
    const api = mockApi({ ...routes(), 'POST /api/recipes/4/to-base': ask })
    const hook = renderHook(() => useBaseRecipeChange({ recipeId: 4 }), { wrapper })
    const { p: out } = await startAsked(hook)
    act(() => hook.result.current.cancelTakeOver())
    expect(await out).toBe('cancelled')
    expect(hook.result.current.takeOverAsk).toBeNull()
    expect(api.callsTo('POST', '/api/recipes/4/to-base')).toHaveLength(1)
  })

  it('a refusal after the answer settles failed with its words (a cycle names the path)', async () => {
    let first = true
    mockApi({
      ...routes(),
      'POST /api/recipes/4/to-base': () => (first ? ((first = false), ask) : refusal(422, 'validation_failed', { field: 'lines[0]', reason: 'base_recipe_cycle', path: ['Pesto', 'Sauce', 'Pesto'] })),
    })
    const hook = renderHook(() => useBaseRecipeChange({ recipeId: 4 }), { wrapper })
    const { p: out } = await startAsked(hook)
    await act(async () => { await hook.result.current.answerTakeOver(true) })
    expect(await out).toBe('failed')
    expect(hook.result.current.error).toBe('Pesto calls for Sauce, which calls for Pesto')
  })

  it('without an ask the ask state stays empty and a plain success is unchanged', async () => {
    const api = mockApi(routes())
    const hook = renderHook(() => useBaseRecipeChange({ recipeId: 4 }), { wrapper })
    let out: Promise<string> = Promise.resolve('')
    act(() => { out = hook.result.current.turnOn(input) })
    await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
    expect(await out).toBe('done')
    expect(hook.result.current.takeOverAsk).toBeNull()
    expect(api.callsTo('POST', '/api/recipes/4/to-base')[0]?.body).toEqual({ yield: 4, yieldUnit: 'portion' })
  })
})
