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
