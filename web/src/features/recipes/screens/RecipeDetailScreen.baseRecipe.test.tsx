import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { garlic, milk, recipe } from '../fixtures.test-helper'
import { household } from '../household.test-helper'
import type { IngredientRef, RecipeLine } from '../types'

// BR-D: the detail's Base recipe lines and line actions; a Base recipe's own detail.
const h = vi.hoisted(() => ({ recipe: {} as Record<string, unknown>, household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences }))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
const bechRef: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
const plainBech: IngredientRef = { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] }
vi.mock('../hooks/useIngredientRefs', () => ({
  useIngredientRefs: () => ({ byId: new Map([[7, garlic], [9, milk], [30, bechRef], [5, plainBech]]), isLoading: false }),
}))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const view = (entry = '/recipes/7') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/recipes/:id" element={<RecipeDetailScreen />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )

const plainLine: RecipeLine = { id: 70, ingredientId: 5, ingredient: 'béchamel', quantity: 500, unit: 'ml', optional: false, note: '' }
const baseLine: RecipeLine = { id: 71, ingredientId: 30, ingredient: 'Béchamel', quantity: 500, unit: 'ml', optional: false, note: '', baseRecipe: { id: 3, name: 'Béchamel', archived: false }, neededAt: 0, linkedFromIngredientId: 5 }
const refetch = vi.fn()
const setRecipe = (r: ReturnType<typeof recipe>) => {
  h.recipe = { recipe: r, isLoading: false, error: null, refetch, setArchived: vi.fn(), remove: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
})

describe('RecipeDetailScreen: Base recipe lines', () => {
  it('reads "500 ml Béchamel (Base recipe)" with the name linking to the Base recipe', async () => {
    mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine] }))
    view()
    expect(screen.getByText(/500 ml Béchamel \(Base recipe\)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Béchamel' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes/3')
  })

  it('Link to a Base recipe saves at once: picks the Base recipe, POSTs the link, toasts with Undo and refreshes', async () => {
    const api = mockApi({
      'GET /api/recipes?kind=base': [summaryJSON({ id: 3, name: 'Béchamel' })], 'GET /api/recipes': [],
      'POST /api/recipes/7/lines/70/base': { id: 7 },
      'DELETE /api/recipes/7/lines/70/base': { id: 7 },
    })
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [plainLine] }))
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link to a Base recipe' }))
    const picker = await screen.findByRole('dialog', { name: 'Link to a Base recipe' })
    await userEvent.click(await within(picker).findByRole('option', { name: /^Béchamel,/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/7/lines/70/base')[0]?.body).toEqual({ baseRecipeId: 3 }))
    expect(await screen.findByText('Linked to Béchamel (Base recipe).')).toBeInTheDocument()
    expect(refetch).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/recipes/7/lines/70/base')).toHaveLength(1))
  })

  it('Use as a plain Ingredient re-points the line back and toasts with Undo', async () => {
    const api = mockApi({ 'DELETE /api/recipes/7/lines/71/base': { id: 7 }, 'POST /api/recipes/7/lines/71/base': { id: 7 } })
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine] }))
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Use as a plain Ingredient' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/recipes/7/lines/71/base')).toHaveLength(1))
    expect(await screen.findByText('Béchamel is a plain Ingredient on this line.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/7/lines/71/base')[0]?.body).toEqual({ baseRecipeId: 3 }))
  })

  it('shows a refusal of the link (a cycle) as words on the screen', async () => {
    mockApi({
      'GET /api/recipes?kind=base': [summaryJSON({ id: 3, name: 'Béchamel' })], 'GET /api/recipes': [],
      'POST /api/recipes/7/lines/70/base': { status: 422, json: { error: { code: 'validation_failed', message: 'x', field: 'lineId', reason: 'base_recipe_cycle', path: ['Lasagne', 'Béchamel', 'Lasagne'] } } },
    })
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [plainLine] }))
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link to a Base recipe' }))
    await userEvent.click(await screen.findByRole('option', { name: /^Béchamel,/ }))
    expect(await screen.findByText('Lasagne calls for Béchamel, which calls for Lasagne')).toBeInTheDocument()
  })
})

describe('RecipeDetailScreen: a Base recipe', () => {
  const bech = () =>
    recipe({
      id: 3, name: 'Béchamel', yield: 1, yieldUnit: 'l', baseRecipe: true, baseIngredientId: 30, courses: [], wholeMeal: false,
      usedBy: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }],
      lines: [{ id: 9, ingredientId: 9, ingredient: 'milk', quantity: 1000, unit: 'ml', optional: false, note: '' }],
    })

  it('shows the Yield with its unit, the Base recipe badge and no Course chips', () => {
    mockApi({})
    setRecipe(bech())
    view('/recipes/3')
    expect(screen.getByText('Yield 1 l')).toBeInTheDocument()
    expect(screen.getByText('Base recipe')).toBeInTheDocument()
    expect(screen.queryByText('4 portions per Batch')).toBeNull()
  })

  it('lists the Recipes that use it as links, under "Used in 2 Recipes"', async () => {
    mockApi({})
    setRecipe(bech())
    view('/recipes/3')
    expect(screen.getByText('Used in 2 Recipes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Moussaka' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes/2')
  })

  it('says "Not used yet" when nothing uses it', () => {
    mockApi({})
    setRecipe({ ...bech(), usedBy: [] })
    view('/recipes/3')
    expect(screen.getByText('Not used yet')).toBeInTheDocument()
  })

  it('keeps "Recipes with an Ingredient named béchamel (3)" until none is left, and opens the list', async () => {
    mockApi({ 'GET /api/recipes/3/link-candidates': { lines: [1, 2, 3].map((n) => candidateJSON({ lineId: n, recipeId: 10 + n, recipeName: `R${n}` })) } })
    setRecipe(bech())
    view('/recipes/3')
    await userEvent.click(await screen.findByRole('button', { name: 'Recipes with an Ingredient named béchamel (3)' }))
    expect(await screen.findByText('3 Recipes use an Ingredient named béchamel. Link them to this Base recipe?')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').every((b) => !(b as HTMLInputElement).checked)).toBe(true)
  })

  it('has no such row when there is nothing to link', async () => {
    const api = mockApi({ 'GET /api/recipes/3/link-candidates': { lines: [] } })
    setRecipe(bech())
    view('/recipes/3')
    await waitFor(() => expect(api.callsTo('GET', '/api/recipes/3/link-candidates')).toHaveLength(1))
    expect(screen.queryByRole('button', { name: /^Recipes with an Ingredient named/ })).toBeNull()
  })

  it('a plannable Recipe never asks for candidates', () => {
    const api = mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne' }))
    view()
    expect(api.calls.some((c) => c.path.includes('link-candidates'))).toBe(false)
  })
})
