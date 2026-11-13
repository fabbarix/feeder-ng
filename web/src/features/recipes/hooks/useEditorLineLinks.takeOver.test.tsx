import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, wrapper } from '../../../lib/baseRecipes/test-utils'
import type { LineDraft } from '../lib/draft'
import { useEditorLineLinks } from './useEditorLineLinks'

// BR-D round 4: the editor's convert path ("Recipes you plan") also handles the take-over ask on to-base.
const pesto = { id: 20, name: 'Pesto' }
const line: LineDraft = { key: 'k', ingredientId: 5, ingredientName: 'pesto', quantity: '200', unit: 'g', optional: false, note: '' }
const plan = { plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0 }
const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'pesto' }, recipes: [{ id: 7, name: 'Lasagne' }], stockLots: 1, convertible: true })
const routes = () => {
  let n = 0
  return { 'POST /api/recipes/20/to-base?dryRun=1': plan, 'POST /api/recipes/20/to-base': () => (++n === 1 ? ask : { id: 20, name: 'Pesto', baseRecipe: true, baseIngredientId: 5 }) }
}
const setup = () => {
  const linkLine = vi.fn()
  const hook = renderHook(() => useEditorLineLinks({ ingredientOf: () => undefined, linkLine, unlinkLine: vi.fn() }), { wrapper })
  return { ...hook, linkLine }
}
async function convert(result: { current: ReturnType<typeof useEditorLineLinks> }) {
  act(() => { void result.current.linkTo(line, { kind: 'convert', recipe: pesto }) })
  await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
}

describe('useEditorLineLinks: convert, take-over ask', () => {
  it('a 409 on to-base sets takeOverAsk and askName; the draft line is not linked yet', async () => {
    const api = mockApi(routes())
    const { result, linkLine } = setup()
    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).not.toBeNull())
    expect(result.current.askName).toBe('Pesto')
    expect(result.current.error).toBeNull()
    expect(linkLine).not.toHaveBeenCalled()
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[0]?.body).toEqual({ yield: 200, yieldUnit: 'g' })
  })

  it('Yes converts with takeOver true, then links the draft line to the Base recipe\'s Ingredient', async () => {
    const api = mockApi(routes())
    const { result, linkLine } = setup()
    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).not.toBeNull())
    await act(async () => { await result.current.answerTakeOver(true) })
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[1]?.body).toEqual({ yield: 200, yieldUnit: 'g', takeOver: true })
    expect(linkLine).toHaveBeenCalledWith('k', { id: 20, name: 'Pesto', ingredientId: 5 })
    expect(result.current.takeOverAsk).toBeNull()
  })

  it('No converts with takeOver false, then links', async () => {
    const api = mockApi(routes())
    const { result, linkLine } = setup()
    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).not.toBeNull())
    await act(async () => { await result.current.answerTakeOver(false) })
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[1]?.body).toEqual({ yield: 200, yieldUnit: 'g', takeOver: false })
    expect(linkLine).toHaveBeenCalledOnce()
  })

  it('cancelTakeOver sends nothing more and links nothing', async () => {
    const api = mockApi(routes())
    const { result, linkLine } = setup()
    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).not.toBeNull())
    act(() => result.current.cancelTakeOver())
    expect(result.current.takeOverAsk).toBeNull()
    expect(api.callsTo('POST', '/api/recipes/20/to-base')).toHaveLength(1)
    expect(linkLine).not.toHaveBeenCalled()
  })
})

// BR-D round 5: the two pending asks (a convert and a new Base recipe) can never both be live; the newest wins, and a failed answer forgets its ask.
describe('useEditorLineLinks: one pending take-over ask at a time', () => {
  const newAsk = refusal(409, 'base_recipe_take_over', { ingredient: { id: 6, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true })
  const bech = { id: 9, name: 'Béchamel', baseIngredientId: 6 }
  const mixed = (retry: unknown) => {
    let toBase = 0
    let created = 0
    return {
      'POST /api/recipes/20/to-base?dryRun=1': plan,
      'POST /api/recipes/20/to-base': () => (++toBase === 1 ? ask : retry),
      'POST /api/recipes': () => (++created === 1 ? newAsk : { status: 201, json: bech }),
    }
  }

  it.each([
    ['422', refusal(422, 'validation_failed', { field: 'lines[0]', reason: 'base_recipe_cycle', path: ['Pesto', 'Sauce', 'Pesto'] })],
    ['500', refusal(500, 'internal')],
  ])('a convert Yes refused (%s) leaves no stale convert: a later new-Base-recipe Yes creates it and never resends to-base', async (_label, retry) => {
    const api = mockApi(mixed(retry))
    const { result, linkLine } = setup()
    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).not.toBeNull())
    await act(async () => { await result.current.answerTakeOver(true) })
    expect(result.current.error).not.toBeNull()
    expect(api.callsTo('POST', '/api/recipes/20/to-base')).toHaveLength(2)

    await act(async () => { await result.current.linkTo(line, { kind: 'new', name: 'Béchamel' }) })
    expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 6 } })
    expect(result.current.askName).toBe('Béchamel')
    await act(async () => { await result.current.answerTakeOver(true) })

    expect(api.callsTo('POST', '/api/recipes/20/to-base')).toHaveLength(2) // still the two from the convert
    expect(api.callsTo('POST', '/api/recipes')).toHaveLength(2)
    expect(api.callsTo('POST', '/api/recipes')[1]?.body).toMatchObject({ name: 'Béchamel', takeOver: true })
    expect(linkLine).toHaveBeenCalledTimes(1)
    expect(linkLine).toHaveBeenCalledWith('k', { id: 9, name: 'Béchamel', ingredientId: 6 })
  })

  it('a new-Base-recipe ask left pending, then a convert: the convert replaces it, and Yes answers the convert only', async () => {
    const api = mockApi(mixed({ id: 20, name: 'Pesto', baseRecipe: true, baseIngredientId: 5 }))
    const { result, linkLine } = setup()
    await act(async () => { await result.current.linkTo(line, { kind: 'new', name: 'Béchamel' }) })
    expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 6 } })

    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 5 } }))
    expect(result.current.askName).toBe('Pesto')

    await act(async () => { await result.current.answerTakeOver(true) })
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[1]?.body).toEqual({ yield: 200, yieldUnit: 'g', takeOver: true })
    expect(api.callsTo('POST', '/api/recipes')).toHaveLength(1) // the abandoned new-Base-recipe ask is never answered
    expect(linkLine).toHaveBeenCalledTimes(1)
    expect(linkLine).toHaveBeenCalledWith('k', { id: 20, name: 'Pesto', ingredientId: 5 })
    expect(result.current.takeOverAsk).toBeNull()
  })

  it('a convert ask left pending, then a new Base recipe: Yes answers the new one only', async () => {
    const api = mockApi(mixed({ id: 20, name: 'Pesto' }))
    const { result, linkLine } = setup()
    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 5 } }))
    await act(async () => { await result.current.linkTo(line, { kind: 'new', name: 'Béchamel' }) })
    expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 6 } })
    await act(async () => { await result.current.answerTakeOver(true) })
    expect(api.callsTo('POST', '/api/recipes/20/to-base')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/recipes')[1]?.body).toMatchObject({ takeOver: true })
    expect(linkLine).toHaveBeenCalledTimes(1)
    expect(linkLine).toHaveBeenCalledWith('k', { id: 9, name: 'Béchamel', ingredientId: 6 })
  })

  it('cancelTakeOver forgets both: a later answer sends nothing', async () => {
    const api = mockApi(mixed({ id: 20, name: 'Pesto' }))
    const { result } = setup()
    await convert(result)
    await vi.waitFor(() => expect(result.current.takeOverAsk).not.toBeNull())
    act(() => result.current.cancelTakeOver())
    const before = api.calls.length
    await act(async () => { await result.current.answerTakeOver(true) })
    expect(api.calls.length).toBe(before)
  })
})
