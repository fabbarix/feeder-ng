import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, refusal, wrapper } from './test-utils'
import { useLineLink, type LinkOutcome, type SavedLine } from './useLineLink'

// BR-D round 4: choosing a plannable Recipe ("Recipes you plan") converts it with to-base; a 409 base_recipe_take_over there is asked too.
const line = (over: Partial<SavedLine> = {}): SavedLine => ({ id: 70, ingredientName: 'pesto', quantity: 200, unit: 'g', linkedFromIngredientId: null, ...over })
const pesto = { id: 20, name: 'Pesto' }
const plan = { plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0 }
const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'pesto' }, recipes: [{ id: 7, name: 'Lasagne' }], stockLots: 1, convertible: true })
const recipeOut = { id: 7, name: 'Lasagne', lines: [] }

/** linkTo(convert) up to the first to-base answer: confirms the dialog. */
async function convert(result: { current: ReturnType<typeof useLineLink> }, l = line()) {
  let out: Promise<LinkOutcome> = Promise.resolve('failed')
  act(() => { out = result.current.linkTo(l, { kind: 'convert', recipe: pesto }) })
  await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
  return out
}
const routes = (extra: Record<string, unknown> = {}) => {
  let n = 0
  return {
    'POST /api/recipes/20/to-base?dryRun=1': plan,
    'POST /api/recipes/20/to-base': () => (++n === 1 ? ask : { id: 20, name: 'Pesto', baseRecipe: true }),
    'POST /api/recipes/7/lines/70/base': recipeOut,
    ...extra,
  }
}

describe('useLineLink: convert, take-over ask', () => {
  it('a 409 on to-base answers "asked": takeOverAsk and askName are set, nothing is linked', async () => {
    const api = mockApi(routes())
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    expect(await convert(result)).toBe('asked')
    expect(result.current.askName).toBe('Pesto')
    expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 5 }, recipes: [{ id: 7, name: 'Lasagne' }], stockLots: 1, convertible: true })
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[0]?.body).toEqual({ yield: 200, yieldUnit: 'g' })
    expect(api.calls.some((c) => c.path.includes('/lines/'))).toBe(false)
  })

  it('Yes converts again with takeOver true, then links the line', async () => {
    const api = mockApi(routes())
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    await convert(result)
    let out = ''
    await act(async () => { out = await result.current.answerTakeOver(true) })
    expect(out).toBe('linked')
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[1]?.body).toEqual({ yield: 200, yieldUnit: 'g', takeOver: true })
    expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')[0]?.body).toEqual({ baseRecipeId: 20 })
    expect(result.current.takeOverAsk).toBeNull()
    expect(await screen.findByText('Linked to Pesto (Base recipe).')).toBeInTheDocument()
  })

  it('Yes on a line the take-over already made a Base recipe line is still "linked", with no error (422 line_not_plain is not a failure there)', async () => {
    mockApi(routes({ 'POST /api/recipes/7/lines/70/base': refusal(422, 'validation_failed', { field: 'lineId', reason: 'line_not_plain' }) }))
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    await convert(result)
    let out = ''
    await act(async () => { out = await result.current.answerTakeOver(true) })
    expect(out).toBe('linked')
    expect(result.current.error).toBeNull()
  })

  it('No converts again with takeOver false, then links the line', async () => {
    const api = mockApi(routes())
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    await convert(result)
    let out = ''
    await act(async () => { out = await result.current.answerTakeOver(false) })
    expect(out).toBe('linked')
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[1]?.body).toEqual({ yield: 200, yieldUnit: 'g', takeOver: false })
    expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')).toHaveLength(1)
  })

  it('cancelTakeOver forgets the ask; nothing more is sent', async () => {
    const api = mockApi(routes())
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    await convert(result)
    act(() => result.current.cancelTakeOver())
    expect(result.current.takeOverAsk).toBeNull()
    expect(api.callsTo('POST', '/api/recipes/20/to-base')).toHaveLength(1)
  })

  it('a cycle on the convert is refused in words (the picker cannot mark plannable Recipes)', async () => {
    mockApi({
      'POST /api/recipes/20/to-base?dryRun=1': plan,
      'POST /api/recipes/20/to-base': refusal(422, 'validation_failed', { field: 'lines[0]', reason: 'base_recipe_cycle', path: ['Pesto', 'Sauce', 'Pesto'] }),
    })
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    expect(await convert(result)).toBe('failed')
    expect(result.current.error).toBe('Pesto calls for Sauce, which calls for Pesto')
  })

  it('a convert that is not asked is unchanged: to-base without takeOver, then the link', async () => {
    const api = mockApi({ 'POST /api/recipes/20/to-base?dryRun=1': plan, 'POST /api/recipes/20/to-base': { id: 20, name: 'Pesto' }, 'POST /api/recipes/7/lines/70/base': recipeOut })
    const { result } = renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })
    expect(await convert(result)).toBe('linked')
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[0]?.body).toEqual({ yield: 200, yieldUnit: 'g' })
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')).toHaveLength(1))
  })
})
