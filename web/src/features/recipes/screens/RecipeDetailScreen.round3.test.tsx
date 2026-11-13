import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, refusal, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { garlic, milk, recipe } from '../fixtures.test-helper'
import { household } from '../household.test-helper'
import type { IngredientRef, RecipeLine } from '../types'

// BR-D round 3 (review): the detail's Use as a plain Ingredient without a remembered Ingredient, the Unit Conversion prompt, the bulk link's unit and Undo,
// valid and named Base recipe lines, and Exclusion-only preferences on a Base recipe.
const h = vi.hoisted(() => ({
  recipe: {} as Record<string, unknown>,
  household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences,
  refs: new Map<number, unknown>(),
}))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: h.refs, isLoading: false }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const bechRef: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
const plainBech: IngredientRef = { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] }
const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const view = (entry = '/recipes/7') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/recipes/:id" element={<><RecipeDetailScreen /><Where /></>} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )

const plainLine: RecipeLine = { id: 70, ingredientId: 5, ingredient: 'béchamel', quantity: 500, unit: 'ml', optional: false, note: '' }
const baseLine = (over: Partial<RecipeLine> = {}): RecipeLine => ({
  id: 71, ingredientId: 30, ingredient: 'Béchamel', quantity: 500, unit: 'ml', optional: false, note: '',
  baseRecipe: { id: 3, name: 'Béchamel', archived: false }, neededAt: 0, linkedFromIngredientId: 5, ...over,
})
const refetch = vi.fn()
const setRecipe = (r: ReturnType<typeof recipe>) => {
  h.recipe = { recipe: r, isLoading: false, error: null, refetch, setArchived: vi.fn(), remove: vi.fn() }
}
const useAsPlain = async (name = 'Actions for Béchamel') => {
  await userEvent.click(screen.getByRole('button', { name }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Use as a plain Ingredient' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
  h.refs = new Map<number, unknown>([[7, garlic], [9, milk], [30, bechRef], [5, plainBech]])
})

describe('detail: Use as a plain Ingredient with nothing to go back to (design §3.7)', () => {
  it('opens "Choose an Ingredient" when nothing is remembered; no Base recipe picker, no request yet', async () => {
    const api = mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine({ linkedFromIngredientId: null })] }))
    view()
    await useAsPlain()
    expect(await screen.findByRole('dialog', { name: 'Choose an Ingredient' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Link to a Base recipe' })).toBeNull()
    expect(api.calls.filter((c) => c.method === 'DELETE')).toEqual([])
  })

  it('opens it as well when the remembered Ingredient is gone (merged or deleted)', async () => {
    h.refs.delete(5)
    mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine({ linkedFromIngredientId: 5 })] }))
    view()
    await useAsPlain()
    expect(await screen.findByRole('dialog', { name: 'Choose an Ingredient' })).toBeInTheDocument()
  })

  it('offers plain Ingredients only, and sends the choice as { ingredientId } on the DELETE', async () => {
    const api = mockApi({ 'DELETE /api/recipes/7/lines/71/base': { id: 7 } })
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine({ linkedFromIngredientId: null })] }))
    view()
    await useAsPlain()
    const dialog = await screen.findByRole('dialog', { name: 'Choose an Ingredient' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ingredient' }))
    expect(screen.queryByRole('option', { name: /Base recipe/ })).toBeNull()
    await userEvent.click(screen.getByRole('option', { name: /garlic/ }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/recipes/7/lines/71/base')[0]?.body).toEqual({ ingredientId: 7 }))
    expect(refetch).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Choose an Ingredient' })).toBeNull()
  })

  it('Cancel changes nothing', async () => {
    const api = mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine({ linkedFromIngredientId: null })] }))
    view()
    await useAsPlain()
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Choose an Ingredient' })).getByRole('button', { name: 'Cancel' }))
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('still goes straight back when the remembered Ingredient exists (no body, no dialog)', async () => {
    const api = mockApi({ 'DELETE /api/recipes/7/lines/71/base': { id: 7 } })
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine()] }))
    view()
    await useAsPlain()
    await waitFor(() => expect(api.callsTo('DELETE', '/api/recipes/7/lines/71/base')).toHaveLength(1))
    expect(api.callsTo('DELETE', '/api/recipes/7/lines/71/base')[0]?.body).toBeUndefined()
    expect(screen.queryByRole('dialog', { name: 'Choose an Ingredient' })).toBeNull()
  })
})

describe('detail: Unit Conversion prompt when a link\'s unit does not convert', () => {
  const unknownUnit = () => refusal(422, 'unknown_unit', { ingredientId: 30, ingredient: 'Béchamel', unit: 'jar', baseUnit: 'ml' })
  const open = async (routes: Record<string, unknown>) => {
    const api = mockApi({ 'GET /api/recipes?kind=base&for=7': [summaryJSON({ id: 3, name: 'Béchamel' })], 'GET /api/recipes': [], ...routes })
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [{ ...plainLine, unit: 'jar', quantity: 2 }] }))
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link to a Base recipe' }))
    await userEvent.click(await screen.findByRole('option', { name: /^Béchamel,/ }))
    return api
  }

  it('shows the prompt, answers it by saving the conversion and linking again', async () => {
    let first = true
    const api = await open({
      'POST /api/recipes/7/lines/70/base': () => (first ? ((first = false), unknownUnit()) : { id: 7 }),
      'PUT /api/ingredients/30/conversions/jar': {},
    })
    const prompt = await screen.findByRole('dialog', { name: 'Unit Conversion needed' })
    await userEvent.type(within(prompt).getByRole('spinbutton', { name: 'Amount in ml' }), '400')
    await userEvent.click(within(prompt).getByRole('button', { name: 'Save Unit Conversion' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/ingredients/30/conversions/jar')[0]?.body).toEqual({ toBase: 400 }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')).toHaveLength(2))
    expect(await screen.findByText('Linked to Béchamel (Base recipe).')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Unit Conversion needed' })).toBeNull()
  })

  it('dismissing it links nothing more', async () => {
    const api = await open({ 'POST /api/recipes/7/lines/70/base': unknownUnit() })
    const prompt = await screen.findByRole('dialog', { name: 'Unit Conversion needed' })
    await userEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Unit Conversion needed' })).toBeNull()
    expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')).toHaveLength(1)
  })
})

describe('detail: the bulk link list of a Base recipe', () => {
  const bech = (over = {}) =>
    recipe({ id: 3, name: 'Béchamel', yield: 1, yieldUnit: 'l', baseRecipe: true, baseIngredientId: 30, courses: [], usedBy: [], lines: [], ...over })
  const cups = [candidateJSON({ lineId: 1, recipeId: 10, recipeName: 'Cannelloni', quantity: 2, unit: 'cup', linkable: false, reason: 'unit_unconvertible' }), candidateJSON({ lineId: 2, recipeId: 11, recipeName: 'Lasagne' })]

  it('takes the base unit from the candidates answer (round 4: top-level baseUnit), never a fallback "ml"', async () => {
    mockApi({ 'GET /api/recipes/3/link-candidates': { baseUnit: 'g', lines: cups } })
    setRecipe(bech())
    view('/recipes/3')
    await userEvent.click(await screen.findByRole('button', { name: /^Recipes with an Ingredient named béchamel \(2\)/ }))
    expect(await screen.findByText('cup cannot be converted to g yet: link it from Cannelloni')).toBeInTheDocument()
  })

  it('opens without the Ingredient list and never reads the Ingredient for its unit', async () => {
    h.refs.delete(30) // the Ingredient list has not loaded it
    const api = mockApi({ 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: cups } })
    setRecipe(bech())
    view('/recipes/3')
    await userEvent.click(await screen.findByRole('button', { name: /^Recipes with an Ingredient named béchamel/ }))
    expect(await screen.findByText(/2 Recipes use an Ingredient named béchamel/)).toBeInTheDocument()
    expect(api.calls.some((c) => c.path.startsWith('/api/ingredients/'))).toBe(false)
  })

  it('Undo of a bulk link refetches the candidates and the Recipe', async () => {
    const api = mockApi({
      'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: cups },
      'POST /api/recipes/3/link': { linked: [2], mergeOffer: [] },
      'POST /api/recipes/3/unlink': undefined,
    })
    setRecipe(bech())
    view('/recipes/3')
    await userEvent.click(await screen.findByRole('button', { name: /^Recipes with an Ingredient named béchamel/ }))
    await userEvent.click(await screen.findByRole('checkbox', { name: /Lasagne/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Link 1' }))
    await screen.findByText('Linked 1 Recipe')
    const before = api.callsTo('GET', '/api/recipes/3/link-candidates').length
    refetch.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/3/unlink')).toHaveLength(1))
    await waitFor(() => expect(api.callsTo('GET', '/api/recipes/3/link-candidates').length).toBeGreaterThan(before))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('detail: Base recipe lines are valid and named', () => {
  it('the link\'s accessible name includes the quantity ("500 ml Béchamel")', () => {
    mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine()] }))
    view()
    const link = screen.getByRole('link', { name: /^500 ml Béchamel/ })
    expect(link).toHaveAttribute('href', '/recipes/3')
  })

  it('every child of the list is a div of dt and dd only (valid markup), "No Ingredients yet" included', () => {
    mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [plainLine, baseLine({ baseRecipe: { id: 3, name: 'Béchamel', archived: false, empty: true } })] }))
    const { container } = view()
    const dl = container.querySelector('dl.ingredient-lines') as HTMLElement
    expect(dl).not.toBeNull()
    for (const child of Array.from(dl.children)) {
      expect(child.tagName).toBe('DIV')
      for (const inner of Array.from(child.children)) expect(['DT', 'DD']).toContain(inner.tagName)
    }
    expect(within(dl).getByText('No Ingredients yet')).toBeInTheDocument()
  })

  it('an archived Base recipe\'s line keeps its link (it still opens, "Béchamel (Base recipe, archived)")', () => {
    mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine({ baseRecipe: { id: 3, name: 'Béchamel', archived: true } })] }))
    view()
    const link = screen.getByRole('link', { name: /Béchamel/ })
    expect(link).toHaveAttribute('href', '/recipes/3')
    expect(link).toHaveTextContent('Base recipe, archived')
  })
})

describe('detail: a Base recipe offers Exclusion only', () => {
  it('has no Favourite and no Dislike buttons or columns, only Exclusion', () => {
    mockApi({})
    setRecipe(recipe({ id: 3, name: 'Béchamel', yield: 1, yieldUnit: 'l', baseRecipe: true, baseIngredientId: 30, courses: [], usedBy: [], lines: [] }))
    view('/recipes/3')
    expect(screen.queryByRole('button', { name: /: Favourite$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /: Dislike$/ })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Favourite' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anna: Exclusion' })).toBeInTheDocument()
  })
  it('a plannable Recipe keeps all three', () => {
    mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [plainLine] }))
    view()
    for (const s of ['Favourite', 'Dislike', 'Exclusion']) expect(screen.getByRole('button', { name: `Anna: ${s}` })).toBeInTheDocument()
  })
})
