import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, refusal, summaryJSON, wrapper, type RecordedCall } from './test-utils'
import { useLineLink, type SavedLine } from './useLineLink'

const line = (over: Partial<SavedLine> = {}): SavedLine => ({ id: 70, ingredientName: 'béchamel', quantity: 500, unit: 'ml', linkedFromIngredientId: null, ...over })
const bech = { id: 3, name: 'Béchamel' }
const recipeOut = { id: 7, name: 'Lasagne', lines: [] }
const setup = () => renderHook(() => useLineLink({ recipeId: 7 }), { wrapper })

describe('useLineLink: Link to a Base recipe (existing)', () => {
  it('re-points the line, toasts "Linked to Béchamel (Base recipe)." and reports the change', async () => {
    const api = mockApi({ 'POST /api/recipes/7/lines/70/base': recipeOut })
    let changed = 0
    const { result } = renderHook(() => useLineLink({ recipeId: 7, onChanged: () => (changed += 1) }), { wrapper })
    let out = ''
    await act(async () => { out = await result.current.linkTo(line(), { kind: 'existing', baseRecipe: bech }) })
    expect(out).toBe('linked')
    expect(api.calls[0]?.body).toEqual({ baseRecipeId: 3 })
    expect(changed).toBe(1)
    expect(await screen.findByText('Linked to Béchamel (Base recipe).')).toBeInTheDocument()
  })

  it('Undo on the toast uses the line as a plain Ingredient again', async () => {
    const api = mockApi({ 'POST /api/recipes/7/lines/70/base': recipeOut, 'DELETE /api/recipes/7/lines/70/base': recipeOut })
    const { result } = setup()
    await act(async () => { await result.current.linkTo(line(), { kind: 'existing', baseRecipe: bech }) })
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/recipes/7/lines/70/base')).toHaveLength(1))
  })

  it('asks for the Unit Conversion inline when the unit does not convert, saves it, and links again', async () => {
    let first = true
    const api = mockApi({
      'POST /api/recipes/7/lines/70/base': () => (first ? ((first = false), refusal(422, 'unknown_unit', { ingredientId: 30, ingredient: 'Béchamel', unit: 'jar', baseUnit: 'ml' })) : recipeOut),
      'PUT /api/ingredients/30/conversions/jar': {},
    })
    const { result } = setup()
    let out = ''
    await act(async () => { out = await result.current.linkTo(line({ unit: 'jar' }), { kind: 'existing', baseRecipe: bech }) })
    expect(out).toBe('unit_prompt')
    expect(result.current.unitPrompt).toEqual({ ingredientId: 30, unit: 'jar', baseUnit: 'ml' })
    await act(async () => { out = await result.current.answerUnitPrompt(400) })
    expect(out).toBe('linked')
    expect(api.callsTo('PUT', '/api/ingredients/30/conversions/jar')[0]?.body).toEqual({ toBase: 400 })
    expect(result.current.unitPrompt).toBeNull()
  })

  it('shows a cycle refusal in words', async () => {
    mockApi({ 'POST /api/recipes/7/lines/70/base': refusal(422, 'validation_failed', { field: 'lineId', reason: 'base_recipe_cycle', path: ['Lasagne', 'Béchamel', 'Lasagne'] }) })
    const { result } = setup()
    let out = ''
    await act(async () => { out = await result.current.linkTo(line(), { kind: 'existing', baseRecipe: bech }) })
    expect(out).toBe('failed')
    expect(result.current.error).toBe('Lasagne calls for Béchamel, which calls for Lasagne')
  })
})

describe('useLineLink: Add as a new Base recipe', () => {
  it('creates it with the line amount as Yield and no Ingredients, then links the line', async () => {
    const api = mockApi({ 'POST /api/recipes': { status: 201, json: summaryJSON({ id: 9, name: 'Béchamel', yield: 500, yieldUnit: 'ml' }) }, 'POST /api/recipes/7/lines/70/base': recipeOut })
    const { result } = setup()
    let out = ''
    await act(async () => { out = await result.current.linkTo(line(), { kind: 'new', name: 'Béchamel' }) })
    expect(out).toBe('linked')
    expect(api.callsTo('POST', '/api/recipes')[0]?.body).toMatchObject({ name: 'Béchamel', baseRecipe: true, yield: 500, yieldUnit: 'ml', lines: [] })
    expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')[0]?.body).toEqual({ baseRecipeId: 9 })
  })

  it('asks the take-over question when a plain Ingredient has that name; nothing is linked until the answer', async () => {
    const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 7, name: 'Lasagne' }], stockLots: 1, convertible: true })
    const api = mockApi({ 'POST /api/recipes': ask })
    const { result } = setup()
    let out = ''
    await act(async () => { out = await result.current.linkTo(line(), { kind: 'new', name: 'Béchamel' }) })
    expect(out).toBe('asked')
    expect(result.current.askName).toBe('Béchamel')
    expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 5 }, stockLots: 1, convertible: true })
    expect(api.calls).toHaveLength(1)
  })

  it('Yes creates it again with takeOver true and links nothing (the take-over already made the line a Base recipe line)', async () => {
    const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true })
    let created = false
    const api = mockApi({ 'POST /api/recipes': (c: RecordedCall) => (((c.body as { takeOver?: boolean }).takeOver === undefined ? ask : ((created = true), { status: 201, json: summaryJSON({ id: 9 }) }))) })
    const { result } = setup()
    await act(async () => { await result.current.linkTo(line(), { kind: 'new', name: 'Béchamel' }) })
    await act(async () => { await result.current.answerTakeOver(true) })
    expect(created).toBe(true)
    expect(api.callsTo('POST', '/api/recipes').at(-1)?.body).toMatchObject({ takeOver: true })
    expect(api.calls.some((c) => c.path.includes('/lines/'))).toBe(false)
    expect(result.current.takeOverAsk).toBeNull()
  })

  it('No creates it again with takeOver false and then links the line', async () => {
    const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true })
    const api = mockApi({
      'POST /api/recipes': (c: RecordedCall) => ((c.body as { takeOver?: boolean }).takeOver === undefined ? ask : { status: 201, json: summaryJSON({ id: 9 }) }),
      'POST /api/recipes/7/lines/70/base': recipeOut,
    })
    const { result } = setup()
    await act(async () => { await result.current.linkTo(line(), { kind: 'new', name: 'Béchamel' }) })
    let out = ''
    await act(async () => { out = await result.current.answerTakeOver(false) })
    expect(out).toBe('linked')
    expect(api.callsTo('POST', '/api/recipes').at(-1)?.body).toMatchObject({ takeOver: false })
    expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')[0]?.body).toEqual({ baseRecipeId: 9 })
  })

  it('shows a name-taken refusal in words', async () => {
    mockApi({ 'POST /api/recipes': refusal(422, 'validation_failed', { field: 'name', reason: 'base_recipe_name_taken' }) })
    const { result } = setup()
    await act(async () => { await result.current.linkTo(line(), { kind: 'new', name: 'Béchamel' }) })
    expect(result.current.error).toBe('Another Base recipe already has this name. Choose a different name.')
  })
})

describe('useLineLink: choose a Recipe you plan (convert)', () => {
  const plan = { plannedMeals: [{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', pinned: true, bought: false }], slotRules: [], leftovers: 0, preferences: 0 }
  const routes = () => ({
    'POST /api/recipes/10/to-base?dryRun=1': plan,
    'POST /api/recipes/10/to-base': summaryJSON({ id: 10, name: 'Pesto' }),
    'POST /api/recipes/7/lines/70/base': recipeOut,
  })

  it('shows the confirm naming what goes; Cancel changes and links nothing', async () => {
    const api = mockApi(routes())
    const { result } = setup()
    let out: Promise<string> = Promise.resolve('')
    act(() => { out = result.current.linkTo(line(), { kind: 'convert', recipe: { id: 10, name: 'Pesto' } }) })
    expect(await screen.findByRole('dialog', { name: 'Turn Pesto into a Base recipe?' })).toBeInTheDocument()
    expect(screen.getByText(/Tue 10 Nov Dinner \(Main, Pinned\)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await out).toBe('cancelled')
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes/10/to-base?dryRun=1'])
  })

  it('Confirm turns it into a Base recipe (its Yield from the line) and links the line to it', async () => {
    const api = mockApi(routes())
    const { result } = setup()
    let out: Promise<string> = Promise.resolve('')
    act(() => { out = result.current.linkTo(line(), { kind: 'convert', recipe: { id: 10, name: 'Pesto' } }) })
    await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
    expect(await out).toBe('linked')
    expect(api.callsTo('POST', '/api/recipes/10/to-base')[0]?.body).toEqual({ yield: 500, yieldUnit: 'ml' })
    expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')[0]?.body).toEqual({ baseRecipeId: 10 })
  })
})

describe('useLineLink: Use as a plain Ingredient', () => {
  const based = (over: Partial<SavedLine> = {}) => line({ linkedFromIngredientId: 5, baseRecipe: bech, ...over })

  it('re-points the line back, and the Undo toast links it to the Base recipe again', async () => {
    const api = mockApi({ 'DELETE /api/recipes/7/lines/70/base': recipeOut, 'POST /api/recipes/7/lines/70/base': recipeOut })
    const { result } = setup()
    let out = ''
    await act(async () => { out = await result.current.useAsPlain(based()) })
    expect(out).toBe('done')
    expect(await screen.findByText('Béchamel is a plain Ingredient on this line.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')[0]?.body).toEqual({ baseRecipeId: 3 }))
  })

  it('makes no request for a take-over line (nothing to go back to) and asks the caller for the ordinary Ingredient picker', async () => {
    const api = mockApi({})
    const { result } = setup()
    let out = ''
    await act(async () => { out = await result.current.useAsPlain(based({ linkedFromIngredientId: null })) })
    expect(out).toBe('pick')
    expect(api.calls).toEqual([])
  })
})
